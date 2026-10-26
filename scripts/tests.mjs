// Carries out the tests of a tree with the test runner of the runtime and the reporter of the runs, and runs again
// only the test files whose record holds a changed file, a failure, a night test or a measure.
// Run: node scripts/tests.mjs [folder] [--night] [--shard=<n>/<of>] [--all]      The light tests, or with --night the
// heavy ones alone; with --shard the share of them that one of several machines runs side by side; with --all every
// file, whatever its record holds.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const words = process.argv.slice(2)
const night = words.includes('--night')
const all = words.includes('--all')
const shard = words.find((word) => word.startsWith('--shard='))?.slice('--shard='.length)
const folder = words.find((word) => !word.startsWith('--')) ?? root

// The rigs of a run each write a small file here, and one that an earlier run left would be gathered as its own.
rmSync(join(folder, 'results', 'parts'), { recursive: true, force: true })
// What each test program noted that it touched, made anew by each run.
rmSync(join(folder, 'results', 'touched'), { recursive: true, force: true })

// The runner skips every file when it finds this in what it is handed, as it is when a test starts this program; and
// a test file of an outer run that starts this program is no test file of this tree, whose files note as their own.
const { NODE_TEST_CONTEXT: _, TENT_TOUCHED_OF: __, ...env } = process.env

// The folders of the test files of the tree: `tests/` and the `tests/` of each part.
const parts = existsSync(join(folder, 'parts')) ? readdirSync(join(folder, 'parts')) : []
const folders = ['tests', ...parts.map((part) => `parts/${part}/tests`)].filter((one) => existsSync(join(folder, one)))
const textOf = (under, name) => readFileSync(join(folder, under, name), 'utf8')
// A file that holds no test the run carries out is not handed to it: the runner starts the last hooks of such a file
// without waiting for its first ones, so what a first hook opens is never closed and the file never ends.
const namesIn = (under) =>
  readdirSync(join(folder, under)).filter(
    (name) => name.endsWith('.test.ts') && (!night || textOf(under, name).includes('[night]')),
  )

// A measure of time taken beside other tests measures them too: a file that measures runs after the others, alone.
const measures = folders.flatMap((under) =>
  namesIn(under)
    .filter((name) => textOf(under, name).includes('rig/budgets.ts'))
    .map((name) => `${under}/${name}`),
)

const results = join(folder, 'results')
// The record of each test file of the light run, as the runs before kept it: by machine, each a file of its own.
const keptFolder = join(results, 'kept')
const keptFile = join(keptFolder, `${shard?.split('/')[0] ?? 'all'}.json`)
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const kept = Object.assign(
  {},
  ...(existsSync(keptFolder) ? readdirSync(keptFolder).map((name) => readJson(join(keptFolder, name))) : []),
)

const print = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** The fingerprint of a path of the tree as it stands: a file by its bytes, a folder by its names, or none. */
function printOf(path) {
  const lies = join(folder, path)
  if (!existsSync(lies)) return 'none'
  return statSync(lies).isDirectory() ? print(readdirSync(lies).sort().join('\n')) : print(readFileSync(lies))
}
/** What every result of the tree stands on beside the files a test touched: the runtime, the system, and settings. */
const ground = [
  process.version,
  `${process.platform}-${process.arch}`,
  ...['package-lock.json', 'biome.json', 'tsconfig.json', 'budgets.json'].map((path) => `${path} ${printOf(path)}`),
  // The run itself, which loads before any note is taken and says what a result is.
  ...['scripts/tests.mjs', 'rig/jsx.ts', 'rig/offline.ts', 'rig/touched.ts', 'rig/report.ts'].map(
    (path) => `${path} ${print(readFileSync(join(root, path)))}`,
  ),
].join('\n')
/** The key of a test file: what the run stands on, and each file and folder its programs touched, as they stand. */
const keyOf = (touched) => print([ground, ...touched.map((path) => `${path} ${printOf(path)}`)].join('\n'))

// A file whose tests passed and whose key is what it was is replayed: but a night test, a measure and a file whose
// rigs wrote what the run gathers, which always run.
const replayed = new Set(
  night || all
    ? []
    : Object.entries(kept)
        .filter(
          ([file, record]) =>
            !record.failed && !record.rigs && !measures.includes(file) && record.key === keyOf(record.touched),
        )
        .map(([file]) => file),
)

// The others are named by a pattern of each folder, leaving out the files that measure and those replayed: a command
// of Windows holds some thirty thousand letters, which the name of every file would pass. The heavy files are few,
// and named each.
const others = night
  ? folders
      .flatMap((under) => namesIn(under).map((name) => `${under}/${name}`))
      .filter((one) => !measures.includes(one))
  : folders.flatMap((under) => {
      const names = namesIn(under).filter((name) => !measures.includes(`${under}/${name}`))
      const run = names.filter((name) => !replayed.has(`${under}/${name}`))
      if (!run.length) return []
      const left = namesIn(under).filter((name) => !run.includes(name))
      if (!left.length) return [`${under}/*.test.ts`]
      // The shorter of the two: the files that run by their names, or the folder with the others left out.
      const named = run.map((name) => `${under}/${name}`)
      const leftOut = `${under}/!(${left.map((name) => name.slice(0, -8)).join('|')}).test.ts`
      return named.join(' ').length < leftOut.length ? named : [leftOut]
    })

/** The result files that stand in the folder of results, by their names. */
const written = () =>
  existsSync(results) ? readdirSync(results).filter((name) => /^(linux|windows|macos)(\.night)?\.json$/.test(name)) : []

/** Runs a set of the files, with the words given beside them, as a share of the machines where `shared`. */
function runOf(set, more, shared) {
  const ended = spawnSync(
    process.execPath,
    [
      // A screen file is a `.tsx` file, which the runtime loads through this rig alone.
      `--import=${pathToFileURL(join(root, 'rig', 'jsx.ts')).href}`,
      // A test reaches nothing but this computer, and finds every part that is fetched at its first use standing.
      `--import=${pathToFileURL(join(root, 'rig', 'offline.ts')).href}`,
      // What each test file touches is noted, in its program and in every program it starts.
      `--import=${pathToFileURL(join(root, 'rig', 'touched.ts')).href}`,
      '--test',
      night ? '--test-name-pattern=\\[night\\]' : '--test-skip-pattern=\\[night\\]',
      ...(shard && shared ? [`--test-shard=${shard}`] : []),
      ...more,
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      `--test-reporter=${pathToFileURL(join(root, 'rig', 'report.ts')).href}`,
      '--test-reporter-destination=stdout',
      ...set,
    ],
    { cwd: folder, stdio: 'inherit', env: { ...env, TENT_RUN: night ? 'night' : 'day', TENT_TOUCHED_TREE: folder } },
  )
  if (ended.error) throw ended.error
  return ended.status ?? 1
}

/** What each test file the run carried out stood as, with the ids of its tests, as the reporter wrote it. */
const filesRan = () => (existsSync(join(results, 'files.json')) ? readJson(join(results, 'files.json')) : {})

/** What each test file's programs touched, every program of one file taken together, and the files whose rigs wrote. */
function touchedOf() {
  const noted = join(results, 'touched')
  const touched = {}
  const rigs = new Set()
  for (const name of existsSync(noted) ? readdirSync(noted) : []) {
    const read = readJson(join(noted, name))
    touched[read.of] = [...new Set([...(touched[read.of] ?? []), ...read.files])].sort()
    if (read.rigs) rigs.add(read.of)
  }
  return { touched, rigs }
}

// The runner given no file runs every file it finds by its own patterns, so a set with none is not run.
const sets = [
  // A heavy test holds a machine's processor and memory by itself: side by side they starved a runner of Windows
  // until it lost its server, so the night runs its files one at a time.
  [others, night ? ['--test-concurrency=1'] : []],
  [measures, ['--test-concurrency=1']],
].filter(([set]) => set.length)

// Each set writes the result file of the run: each is laid aside, and they are joined into it as shares are.
const shares = join(results, 'sets')
rmSync(shares, { recursive: true, force: true })
const ran = {}
const codes = sets.map(([set, more], k) => {
  rmSync(join(results, 'files.json'), { force: true })
  const code = runOf(set, more, true)
  Object.assign(ran, filesRan())
  mkdirSync(join(shares, String(k)), { recursive: true })
  for (const name of written()) renameSync(join(results, name), join(shares, String(k), name))
  return code
})
rmSync(join(results, 'files.json'), { force: true })
// A replayed file stands in the result file as each of its ids stood when it was kept.
if (replayed.size) {
  const tests = {}
  const worst = ['passed', 'owed', 'failed']
  for (const [id, state] of [...replayed].flatMap((file) => Object.entries(kept[file].ids)))
    if (tests[id] === undefined || worst.indexOf(state) > worst.indexOf(tests[id])) tests[id] = state
  const system = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform]
  // The commit is the one the shares that ran name, or the one the run names where every file was replayed.
  const ranShare = sets.map((_, k) => join(shares, String(k), `${system}.json`)).find(existsSync)
  const commit = ranShare ? readJson(ranShare).commit : (process.env.TENT_COMMIT ?? '')
  mkdirSync(join(shares, 'replayed'), { recursive: true })
  writeFileSync(
    join(shares, 'replayed', `${system}.json`),
    `${JSON.stringify({ system, commit, tests, measures: {}, pictures: {} }, null, 2)}\n`,
  )
  for (const file of [...replayed].sort()) console.log(`replayed ${file}`)
}
let joined = 0
if (existsSync(shares) && readdirSync(shares).length) {
  joined =
    spawnSync(process.execPath, [join(root, 'scripts', 'shards.mjs'), shares, results], { stdio: 'inherit' }).status ??
    1
  rmSync(shares, { recursive: true, force: true })
}

// The record of the light run: each file that ran, with what it touched, its key and how it stood, and each replayed
// file as it was kept. A file that is no test file of the tree any more is gone.
if (!night) {
  const { touched, rigs } = touchedOf()
  const record = {}
  for (const [file, stood] of Object.entries(ran))
    record[file] = {
      key: keyOf(touched[file] ?? []),
      touched: touched[file] ?? [],
      ids: stood.ids,
      failed: stood.failed,
      ...(rigs.has(file) ? { rigs: true } : {}),
    }
  for (const file of replayed) record[file] = kept[file]
  mkdirSync(keptFolder, { recursive: true })
  for (const name of readdirSync(keptFolder)) rmSync(join(keptFolder, name))
  writeFileSync(keptFile, `${JSON.stringify(record, null, 2)}\n`)
}
process.exit(codes.find((code) => code !== 0) ?? joined)
