// Carries out the tests of a tree with the test runner of the runtime and the reporter of the runs.
// Run: node scripts/tests.mjs [folder] [--night] [--shard=<n>/<of>]      The light tests, or with --night the heavy
// ones alone; with --shard the share of them that one of several machines runs side by side.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
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
const namesIn = (under) => readdirSync(join(folder, under)).filter((name) => name.endsWith('.test.ts'))

// A measure of time taken beside other tests measures them too: a file that measures runs after the others, alone.
const measures = folders.flatMap((under) =>
  namesIn(under)
    .filter((name) => readFileSync(join(folder, under, name), 'utf8').includes('rig/budgets.ts'))
    .map((name) => `${under}/${name}`),
)
// The others are named by a pattern of each folder, leaving out the files that measure: a command of Windows holds
// some thirty thousand letters, which the name of every file would pass.
const others = folders
  .filter((under) => namesIn(under).some((name) => !measures.includes(`${under}/${name}`)))
  .map((under) => {
    const left = measures.filter((one) => one.startsWith(`${under}/`)).map((one) => one.slice(under.length + 1, -8))
    return left.length ? `${under}/!(${left.join('|')}).test.ts` : `${under}/*.test.ts`
  })

/** Runs a set of the files, with the words given beside them. Answers the code the runner ended with. */
function runOf(set, more) {
  const ended = spawnSync(
    process.execPath,
    [
      // A screen file is a `.tsx` file, which the runtime loads through this rig alone.
      `--import=${pathToFileURL(join(root, 'rig', 'jsx.ts')).href}`,
      // A test reaches nothing but this computer, and finds every part that is fetched at its first use standing.
      `--import=${pathToFileURL(join(root, 'rig', 'offline.ts')).href}`,
      '--test',
      night ? '--test-name-pattern=\\[night\\]' : '--test-skip-pattern=\\[night\\]',
      ...(shard ? [`--test-shard=${shard}`] : []),
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
  return ended.status ?? 1
}

// The runner given no file runs every file it finds by its own patterns, so a set with none is not run.
const sets = [
  [others, []],
  [measures, ['--test-concurrency=1']],
].filter(([set]) => set.length)
if (sets.length < 2) process.exit(sets.length ? runOf(...sets[0]) : 0)

// Each set writes the result file of the run: each is laid aside, and the two are joined into it as shares are.
const results = join(folder, 'results')
const shares = join(results, 'sets')
rmSync(shares, { recursive: true, force: true })
const codes = sets.map(([set, more], k) => {
  const code = runOf(set, more)
  const written = existsSync(results)
    ? readdirSync(results).filter((name) => /^(linux|windows|macos)(\.night)?\.json$/.test(name))
    : []
  mkdirSync(join(shares, String(k)), { recursive: true })
  for (const name of written) renameSync(join(results, name), join(shares, String(k), name))
  return code
})
const joined = spawnSync(process.execPath, [join(root, 'scripts', 'shards.mjs'), shares, results], { stdio: 'inherit' })
rmSync(shares, { recursive: true, force: true })
process.exit(codes.find((code) => code !== 0) ?? joined.status ?? 1)
