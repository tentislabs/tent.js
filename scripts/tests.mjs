// Carries out the tests of a tree with the test runner of the runtime and the reporter of the runs.
// Run: node scripts/tests.mjs [folder] [--night] [--shard=<n>/<of>]      The light tests, or with --night the heavy
// ones alone; with --shard the share of them that one of several machines runs side by side.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const words = process.argv.slice(2)
const night = words.includes('--night')
const shard = words.find((word) => word.startsWith('--shard='))?.slice('--shard='.length)
const folder = words.find((word) => !word.startsWith('--')) ?? root

// The rigs of a run each write a small file here, and one that an earlier run left would be gathered as its own.
rmSync(join(folder, 'results', 'parts'), { recursive: true, force: true })

// The runner skips every file when it finds this in what it is handed, as it is when a test starts this program.
const { NODE_TEST_CONTEXT: _, ...env } = process.env

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
// The others are named by a pattern of each folder, leaving out the files that measure: a command of Windows holds
// some thirty thousand letters, which the name of every file would pass. The heavy files are few, and named each.
const others = night
  ? folders
      .flatMap((under) => namesIn(under).map((name) => `${under}/${name}`))
      .filter((one) => !measures.includes(one))
  : folders
      .filter((under) => namesIn(under).some((name) => !measures.includes(`${under}/${name}`)))
      .map((under) => {
        const left = measures.filter((one) => one.startsWith(`${under}/`)).map((one) => one.slice(under.length + 1, -8))
        return left.length ? `${under}/!(${left.join('|')}).test.ts` : `${under}/*.test.ts`
      })

const results = join(folder, 'results')
/** The result files that stand in the folder of results, by their names. */
const written = () =>
  existsSync(results) ? readdirSync(results).filter((name) => /^(linux|windows|macos)(\.night)?\.json$/.test(name)) : []
const worst = ['passed', 'owed', 'failed']
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** Runs a set of the files, with the words given beside them, as a share of the machines where `shared`. */
function runOf(set, more, shared) {
  rmSync(join(results, 'failed.json'), { force: true })
  const ended = spawnSync(
    process.execPath,
    [
      // A screen file is a `.tsx` file, which the runtime loads through this rig alone.
      `--import=${pathToFileURL(join(root, 'rig', 'jsx.ts')).href}`,
      // A test reaches nothing but this computer, and finds every part that is fetched at its first use standing.
      `--import=${pathToFileURL(join(root, 'rig', 'offline.ts')).href}`,
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
    { cwd: folder, stdio: 'inherit', env: { ...env, TENT_RUN: night ? 'night' : 'day' } },
  )
  if (ended.error) throw ended.error
  const failed = existsSync(join(results, 'failed.json')) ? readJson(join(results, 'failed.json')) : undefined
  rmSync(join(results, 'failed.json'), { force: true })
  return { code: ended.status ?? 1, failed }
}

/**
 * Runs a set of the files, and where tests of them failed and nothing else failed the run, runs their files once
 * more: a test that passes there passes the run and is named flaky, as a warning of the run where it is GitHub's,
 * until it is mended. The result file holds each id as the second try left it. Answers the code the run ended with.
 */
function triedOf(set, more) {
  const first = runOf(set, more, true)
  if (first.code === 0 || !first.failed?.failing.length || first.failed.wrong.length) return first.code
  const name = written().find((one) => one.endsWith('.night.json') === night)
  if (!name) return first.code
  const before = readJson(join(results, name))
  const files = [...new Set(first.failed.failing.map((one) => one.file))]
  console.log(`\nThe tests that failed are run once more, with the other tests of their ${files.length} files.\n`)
  const second = runOf(files, more, false)
  const after = readJson(join(results, name))
  // An id that failed stands as its second try left it: every test that failed stood in a file run again.
  const tests = { ...before.tests }
  for (const [id, state] of Object.entries(after.tests)) {
    const was = before.tests[id]
    tests[id] =
      was === undefined || was === 'failed' ? state : worst[Math.max(worst.indexOf(was), worst.indexOf(state))]
  }
  const ordered = Object.fromEntries(Object.entries(tests).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  writeFileSync(join(results, name), `${JSON.stringify({ ...after, tests: ordered }, null, 2)}\n`)
  const again = new Set((second.failed?.failing ?? []).map((one) => `${one.file} ${one.name}`))
  const flaky = first.failed.failing.filter((one) => !again.has(`${one.file} ${one.name}`))
  for (const one of flaky) {
    const said = `flaky: ${one.name}, which failed at its first try and passed at its second`
    console.log(process.env.GITHUB_ACTIONS ? `::warning title=A flaky test::${said}` : said)
  }
  return second.code
}

// The runner given no file runs every file it finds by its own patterns, so a set with none is not run.
const sets = [
  // A heavy test holds a machine's processor and memory by itself: side by side they starved a runner of Windows
  // until it lost its server, so the night runs its files one at a time.
  [others, night ? ['--test-concurrency=1'] : []],
  [measures, ['--test-concurrency=1']],
].filter(([set]) => set.length)
if (sets.length < 2) process.exit(sets.length ? triedOf(...sets[0]) : 0)

// Each set writes the result file of the run: each is laid aside, and the two are joined into it as shares are.
const shares = join(results, 'sets')
rmSync(shares, { recursive: true, force: true })
const codes = sets.map(([set, more], k) => {
  const code = triedOf(set, more)
  mkdirSync(join(shares, String(k)), { recursive: true })
  for (const name of written()) renameSync(join(results, name), join(shares, String(k), name))
  return code
})
const joined = spawnSync(process.execPath, [join(root, 'scripts', 'shards.mjs'), shares, results], { stdio: 'inherit' })
rmSync(shares, { recursive: true, force: true })
process.exit(codes.find((code) => code !== 0) ?? joined.status ?? 1)
