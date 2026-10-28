// Carries out the tests of a tree with the test runner of the runtime and the reporter of the runs, and runs again
// only the test files whose record holds a changed file, a failure, a night test or a measure. The files of the tests
// that failed are run once more: a test that passes there passes the run and is named flaky.
// Run: node scripts/tests.mjs [folder] [--night] [--all] [--profile] [--list=<file>] [--times=<n>]
// The light tests, or with --night the heavy ones alone; with --all every file, whatever its record holds; with --profile what each test file cost in time
// and memory, written into results/profile.json, with the costliest printed; with --list only the test files that
// the file names, one path from the tree on each line; with --times every file that runs, that many times in a row
// and with no second try, as new tests are run before they are joined.
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { constants, setPriority, totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { concurrencyOf, coresHere, memoryNow } from '../parts/cli/programsAtOnce.ts'
import { listed } from '../rig/where.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const words = process.argv.slice(2)

// The run and every program it starts, which take the priority of the program that starts them, give way to the
// computer's own programs: a run that holds every core of a machine of the automatic runs starved the program that
// reports to its server until the server lost it.
setPriority(constants.priority.PRIORITY_BELOW_NORMAL)
const night = words.includes('--night')
const all = words.includes('--all')
const profiling = words.includes('--profile')
const times = Number(words.find((word) => word.startsWith('--times='))?.slice('--times='.length) ?? 1)
// The folder by its whole path: each program of the run is started in it, and reads the paths of the run from there.
const folder = resolve(words.find((word) => !word.startsWith('--')) ?? root)
const list = words.find((word) => word.startsWith('--list='))?.slice('--list='.length)
const only = list === undefined ? undefined : new Set(listed(folder, list))

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
const allIn = (under) =>
  readdirSync(join(folder, under)).filter(
    (name) => name.endsWith('.test.ts') && (!night || textOf(under, name).includes('[night]')),
  )
/** The test files of a folder that this run carries out: those of the list alone, where it is given one. */
const namesIn = (under) => allIn(under).filter((name) => !only || only.has(`${under}/${name}`))

// A measure of time taken beside other tests measures them too: a file that measures runs after the others, alone.
const measures = folders.flatMap((under) =>
  namesIn(under)
    .filter((name) => textOf(under, name).includes('rig/budgets.ts'))
    .map((name) => `${under}/${name}`),
)

const results = join(folder, 'results')
// The record of each test file of the light run, as the runs before kept it. On GitHub it is kept between runs by the
// cache of the workflow, so a push there too runs only what it touched.
const keptFolder = join(results, 'kept')
const keptFile = join(keptFolder, 'all.json')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const kept = existsSync(keptFile) ? readJson(keptFile) : {}

const print = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** The fingerprint of a path of the tree as it stands: a file by its bytes, a folder by its names, or none. */
function printOf(path) {
  const lies = join(folder, path)
  if (!existsSync(lies)) return 'none'
  const kind = statSync(lies)
  if (kind.isDirectory()) return print(readdirSync(lies).sort().join('\n'))
  return kind.isFile() ? print(readFileSync(lies)) : 'none'
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
// The most memory one test file's programs held together, at the ninetieth share of the files of a whole run on
// Windows with `--profile`: half of them 253 MB, the most 13 GB, of a file that starts many programs.
const programPeak = 450 * 1024 * 1024
// As many test files at once as the processor has cores less one, and no more than the memory there is holds.
const concurrency = concurrencyOf({ cores: coresHere(), free: memoryNow(), peak: programPeak })
// The cores each program of the run has as its share, which the rig holds it to: a program a test starts that runs
// programs side by side, as `tent test` does, runs no more of them than its share holds. Two at the least, so that a
// program has one to run beside it.
const share = Math.max(2, Math.floor(coresHere() / (night ? 1 : concurrency)))

// What the runner and each test program are handed of the environment, which a word a test read is held to.
// Every program of the run, and every program one starts, loads the modules it compiled before from the runtime's
// compile cache: a quarter of the load of the engine. Nothing under `results/` stands in a key of a test.
const handed = {
  ...env,
  TENT_RUN: night ? 'night' : 'day',
  TENT_TOUCHED_TREE: folder,
  TENT_RUN_CORES: String(share),
  NODE_COMPILE_CACHE: join(folder, 'results', 'compile-cache'),
}
// The rig of each program reads it, and notes a word as the run handed it: one a test set itself is the test's own.
// It is taken away when the run ends, since a word may hold a secret.
mkdirSync(join(folder, 'results'), { recursive: true })
writeFileSync(join(folder, 'results', 'handed.json'), JSON.stringify(handed))
// A word as the system finds it: by its letters alone on Windows, as the rig notes it.
const fold = (word) => (process.platform === 'win32' ? word.toUpperCase() : word)
const handedFolded = new Map(Object.entries(handed).map(([word, value]) => [fold(word), value]))
/**
 * The key of a test file: what the run stands on, each file and folder its programs touched with its fingerprint,
 * and each word of the environment its program read with its value.
 */
const keyOf = (prints, words) =>
  print(
    [
      ground,
      ...Object.entries(prints).map(([path, one]) => `${path} ${one}`),
      ...Object.entries(words).map(([word, value]) => `env ${word} ${JSON.stringify(value)}`),
    ].join('\n'),
  )
/** The key of a kept file by the files and the words it stood on, as they stand now. */
const keyNow = (record) =>
  keyOf(
    Object.fromEntries(record.touched.map((path) => [path, printOf(path)])),
    Object.fromEntries(
      Object.keys(record.env ?? {}).map((word) => {
        const value = handedFolded.get(fold(word))
        return [word, value === undefined ? null : print(value)]
      }),
    ),
  )

// A file whose tests passed and whose key is what it was is replayed: but a night test, a measure and a file whose
// rigs wrote what the run gathers, which always run.
const replayed = new Set(
  night || all || times > 1
    ? []
    : Object.entries(kept)
        .filter(
          ([file, record]) =>
            (!only || only.has(file)) &&
            !record.failed &&
            !record.rigs &&
            !measures.includes(file) &&
            record.key === keyNow(record),
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
      const left = allIn(under).filter((name) => !run.includes(name))
      if (!left.length) return [`${under}/*.test.ts`]
      // The shorter of the two: the files that run by their names, or the folder with the others left out.
      const named = run.map((name) => `${under}/${name}`)
      const leftOut = `${under}/!(${left.map((name) => name.slice(0, -8)).join('|')}).test.ts`
      return named.join(' ').length < leftOut.length ? named : [leftOut]
    })

/** The result files that stand in the folder of results, by their names. */
const written = () =>
  existsSync(results) ? readdirSync(results).filter((name) => /^(linux|windows|macos)(\.night)?\.json$/.test(name)) : []

// The least memory there was while the run went on, which a run with --profile looks at twice a second.
let least = Number.POSITIVE_INFINITY
const began = { at: performance.now(), free: memoryNow() }

/** Runs a set of the files, with the words given beside them. */
async function runOf(set, more) {
  const runner = spawn(
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
      ...more,
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      `--test-reporter=${pathToFileURL(join(root, 'rig', 'report.ts')).href}`,
      '--test-reporter-destination=stdout',
      ...set,
    ],
    { cwd: folder, stdio: 'inherit', env: handed },
  )
  const looking = profiling ? setInterval(() => (least = Math.min(least, memoryNow())), 500) : undefined
  try {
    const [code] = await once(runner, 'exit')
    return code ?? 1
  } finally {
    clearInterval(looking)
  }
}

/** What each test file the run carried out stood as, with the ids of its tests, as the reporter wrote it. */
const filesRan = () => (existsSync(join(results, 'files.json')) ? readJson(join(results, 'files.json')) : {})

/**
 * What each test file's programs touched, every program of one file taken together: each path with its fingerprint
 * as a program first read it, the words of the environment it read, whether its rigs wrote, and whether a path it
 * read changed while it ran, as two programs saw it otherwise or as it stands now.
 */
function touchedOf() {
  const noted = join(results, 'touched')
  const touched = {}
  for (const name of existsSync(noted) ? readdirSync(noted) : [])
    for (const line of readFileSync(join(noted, name), 'utf8').split('\n')) {
      // A program that was killed as it told may leave its last line cut: it is no note.
      let read
      try {
        read = JSON.parse(line)
      } catch {
        continue
      }
      const held = touched[read.of] ?? { prints: {}, env: {}, rigs: false, changed: false }
      if (read.file !== undefined) {
        if (held.prints[read.file] !== undefined && held.prints[read.file] !== read.print) held.changed = true
        held.prints[read.file] = read.print
      }
      if (read.word !== undefined) held.env[read.word] = read.value
      held.rigs ||= read.rigs === true
      touched[read.of] = held
    }
  for (const held of Object.values(touched))
    held.changed ||= Object.entries(held.prints).some(([path, one]) => printOf(path) !== one)
  return touched
}

/**
 * Writes `results/profile.json`: what each test file of the run cost, from what each of its programs told as it
 * ended, its time and the peak of its own program, the sum of the peaks of all its programs and how many there were,
 * and the time of the run and the most memory the computer held while it went on. Prints the twenty costliest files
 * by time and by memory, and that peak.
 */
function profiled() {
  const noted = join(results, 'touched')
  const files = {}
  for (const name of existsSync(noted) ? readdirSync(noted) : [])
    for (const line of readFileSync(join(noted, name), 'utf8').split('\n')) {
      let read
      try {
        read = JSON.parse(line)
      } catch {
        continue
      }
      if (read.program === undefined) continue
      const held = files[read.of] ?? { ms: 0, peak: 0, sum: 0, programs: 0 }
      if (read.top) Object.assign(held, { ms: Math.max(held.ms, read.ms), peak: Math.max(held.peak, read.peak) })
      held.sum += read.peak
      held.programs += 1
      files[read.of] = held
    }
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)))
  // The most memory the computer held while the run went on, and how much of it the run took beside what it held before.
  const peak = totalmem() - Math.min(least, began.free)
  const taken = Math.max(0, began.free - least)
  const profile = { ms: Math.round(performance.now() - began.at), peak, taken, files: sorted }
  mkdirSync(results, { recursive: true })
  writeFileSync(join(results, 'profile.json'), `${JSON.stringify(profile, null, 2)}\n`)
  const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`
  const costliest = (by, said) =>
    Object.entries(files)
      .sort(([, a], [, b]) => b[by] - a[by])
      .slice(0, 20)
      .map(([file, one]) => `  ${said(one)}  ${file}`)
  console.log(
    [
      'costliest by time:',
      ...costliest('ms', (one) => `${(one.ms / 1000).toFixed(1)} s`),
      'costliest by memory:',
      ...costliest('sum', (one) => `${mb(one.sum)} (its own program ${mb(one.peak)}, ${one.programs} programs)`),
      `peak of the run: ${mb(peak)}, ${mb(taken)} more than as it began, in ${(profile.ms / 1000 / 60).toFixed(1)} minutes`,
    ].join('\n'),
  )
}

// The runner given no file runs every file it finds by its own patterns, so a set with none is not run.
const sets = [
  // A heavy test holds a machine's processor and memory by itself: side by side they starved a runner of Windows
  // until it lost its server, so the night runs its files one at a time.
  [others, [`--test-concurrency=${night ? 1 : concurrency}`]],
  [measures, ['--test-concurrency=1']],
].filter(([set]) => set.length)

const worst = ['passed', 'owed', 'failed']
const system = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform]
const ran = {}
// The tests named flaky: each failed at its first try and passed at its second. And what failed the run, which
// `results/failed.json` holds once the run ends: each test that failed at its last try, and each other reason.
const flaky = []
const failedRun = { failing: [], wrong: [] }
const failedFile = join(results, 'failed.json')
/** What the reporter wrote of the tests that failed and of what else failed the run, taken away once read. */
function failedOf() {
  const read = existsSync(failedFile) ? readJson(failedFile) : undefined
  rmSync(failedFile, { force: true })
  return read
}

/**
 * Runs a set of the files, and where tests of them failed and nothing else failed the run, runs their files once
 * more, as the test runners of the strongest frameworks retry: a test that passes there passes the run and is named
 * flaky, as a warning of the run where it is GitHub's, until it is mended. The result file holds each id as the second
 * try left it, and the names of the flaky tests. A file whose test failed keeps its failure in its record, so it is
 * run again by the next run too. Run more than once in a row, nothing is tried twice. Answers the code it ended with.
 */
async function triedOf(set, more) {
  rmSync(join(results, 'files.json'), { force: true })
  failedOf()
  const code = await runOf(set, more)
  Object.assign(ran, filesRan())
  const first = failedOf()
  const name = written().find((one) => one.endsWith('.night.json') === night)
  if (code === 0 || times > 1 || !first?.failing.length || first.wrong.length || !name) {
    failedRun.failing.push(...(first?.failing ?? []))
    failedRun.wrong.push(...(first?.wrong ?? []))
    return code
  }
  const before = readJson(join(results, name))
  const files = [...new Set(first.failing.map((one) => one.file))]
  console.log(`\nThe tests that failed are run once more, with the other tests of their ${files.length} files.\n`)
  const again = await runOf(files, more)
  const second = failedOf()
  failedRun.failing.push(...(second?.failing ?? []))
  failedRun.wrong.push(...(second?.wrong ?? []))
  const after = readJson(join(results, name))
  // An id that failed stands as its second try left it: every test that failed stood in a file run again.
  const tests = { ...before.tests }
  for (const [id, state] of Object.entries(after.tests)) {
    const was = before.tests[id]
    tests[id] =
      was === undefined || was === 'failed' ? state : worst[Math.max(worst.indexOf(was), worst.indexOf(state))]
  }
  const ordered = Object.fromEntries(Object.entries(tests).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  const failedAgain = new Set((second?.failing ?? []).map((one) => `${one.file} ${one.name}`))
  const named = first.failing.filter((one) => !failedAgain.has(`${one.file} ${one.name}`)).map((one) => one.name)
  for (const one of named) {
    const said = `flaky: ${one}, which failed at its first try and passed at its second`
    console.log(process.env.GITHUB_ACTIONS ? `::warning title=A flaky test::${said}` : said)
  }
  flaky.push(...named)
  writeFileSync(
    join(results, name),
    `${JSON.stringify({ ...after, tests: ordered, ...(named.length ? { flaky: named } : {}) }, null, 2)}\n`,
  )
  return again
}

/**
 * Joins the result files laid aside by each set and round into one result file for each system: a test stands as the
 * worst state any of them gave it, and the measures, the pictures and the flaky tests of each are kept.
 */
function joinedInto(from, into) {
  const held = new Map()
  for (const file of readdirSync(from, { recursive: true }).map(String)) {
    const name = file.replace(/^.*[\\/]/, '')
    if (!/^(linux|windows|macos)(\.night)?\.json$/.test(name)) continue
    const one = readJson(join(from, file))
    const joined = held.get(name) ?? { ...one, tests: {}, measures: {}, pictures: {} }
    for (const [id, state] of Object.entries(one.tests))
      if (joined.tests[id] === undefined || worst.indexOf(state) > worst.indexOf(joined.tests[id])) joined.tests[id] = state
    Object.assign(joined.measures, one.measures)
    Object.assign(joined.pictures, one.pictures)
    if (one.flaky?.length) joined.flaky = [...new Set([...(joined.flaky ?? []), ...one.flaky])].sort()
    held.set(name, joined)
  }
  mkdirSync(into, { recursive: true })
  for (const [name, result] of held) {
    const tests = Object.fromEntries(Object.entries(result.tests).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(join(into, name), `${JSON.stringify({ ...result, tests }, null, 2)}
`)
  }
}

// Each set writes the result file of the run: each is laid aside, and they are joined into it, so an id stands as the
// worst of every round.
const shares = join(results, 'sets')
rmSync(shares, { recursive: true, force: true })
const codes = []
for (let round = 1; round <= times; round++) {
  if (times > 1) console.log(`\nRound ${round} of ${times}.\n`)
  for (const [k, [set, more]] of sets.entries()) {
    codes.push(await triedOf(set, more))
    mkdirSync(join(shares, `${round}-${k}`), { recursive: true })
    for (const name of written()) renameSync(join(results, name), join(shares, `${round}-${k}`, name))
  }
}
rmSync(join(results, 'files.json'), { force: true })
writeFileSync(failedFile, `${JSON.stringify(failedRun, null, 2)}\n`)
// A replayed file stands in the result file as each of its ids stood when it was kept.
if (replayed.size) {
  const tests = {}
  for (const [id, state] of [...replayed].flatMap((file) => Object.entries(kept[file].ids)))
    if (tests[id] === undefined || worst.indexOf(state) > worst.indexOf(tests[id])) tests[id] = state
  // The commit is the one the shares that ran name, or the one the run names where every file was replayed.
  const ranShare = sets.map((_, k) => join(shares, `1-${k}`, `${system}.json`)).find(existsSync)
  const commit = ranShare ? readJson(ranShare).commit : (process.env.TENT_COMMIT ?? '')
  mkdirSync(join(shares, 'replayed'), { recursive: true })
  writeFileSync(
    join(shares, 'replayed', `${system}.json`),
    `${JSON.stringify({ system, commit, tests, measures: {}, pictures: {} }, null, 2)}\n`,
  )
  for (const file of [...replayed].sort()) console.log(`replayed ${file}`)
}
if (existsSync(shares)) {
  joinedInto(shares, results)
  rmSync(shares, { recursive: true, force: true })
}

// The tests named flaky stand in the summary of the job, where everyone who opens the run sees them.
if (flaky.length && process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      `## The flaky tests on ${system}`,
      '',
      'Each failed at its first try and passed at its second, and so passed the run, until it is mended.',
      '',
      ...flaky.map((one) => `- ${one}`),
      '',
    ].join('\n'),
  )

// The record of the light run: each file that ran, with what it touched, its key and how it stood, each replayed file
// as it was kept, and each file outside the list of a run given one as it was kept. A file that is no test file of the
// tree any more is gone. A run of the same files several times in a row keeps the record as it was.
if (!night && times === 1) {
  const touched = touchedOf()
  const record = {}
  for (const [file, stood] of Object.entries(ran)) {
    const held = touched[file] ?? { prints: {}, env: {}, rigs: false, changed: false }
    // A file whose test read a path that changed while it ran keeps no record: the run did not test what stands.
    if (held.changed) continue
    const prints = Object.fromEntries(Object.entries(held.prints).sort(([a], [b]) => (a < b ? -1 : 1)))
    const words = Object.fromEntries(Object.entries(held.env).sort(([a], [b]) => (a < b ? -1 : 1)))
    record[file] = {
      key: keyOf(prints, words),
      touched: Object.keys(prints),
      env: words,
      ids: stood.ids,
      failed: stood.failed,
      ...(held.rigs ? { rigs: true } : {}),
    }
  }
  for (const file of replayed) record[file] = kept[file]
  if (only)
    for (const [file, held] of Object.entries(kept))
      if (!only.has(file) && existsSync(join(folder, file))) record[file] ??= held
  mkdirSync(keptFolder, { recursive: true })
  writeFileSync(keptFile, `${JSON.stringify(record, null, 2)}\n`)
}
if (profiling) profiled()
rmSync(join(folder, 'results', 'handed.json'), { force: true })
process.exit(codes.find((code) => code !== 0) ?? 0)
