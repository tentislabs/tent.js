// Carries out the tests of a tree with the test runner of the runtime and the reporter of the runs.
// Run: node scripts/tests.mjs [folder] [--night]      The light tests, or with --night the heavy ones alone.
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const words = process.argv.slice(2)
const night = words.includes('--night')
const folder = words.find((word) => !word.startsWith('--')) ?? root

// The rigs of a run each write a small file here, and one that an earlier run left would be gathered as its own.
rmSync(join(folder, 'results', 'parts'), { recursive: true, force: true })

// The runner skips every file when it finds this in what it is handed, as it is when a test starts this program.
const { NODE_TEST_CONTEXT: _, ...env } = process.env

const ended = spawnSync(
  process.execPath,
  [
    // A screen file is a `.tsx` file, which the runtime loads through this rig alone.
    `--import=${pathToFileURL(join(root, 'rig', 'jsx.ts')).href}`,
    // A test reaches nothing but this computer, and finds every part that is fetched at its first use standing.
    `--import=${pathToFileURL(join(root, 'rig', 'offline.ts')).href}`,
    '--test',
    night ? '--test-name-pattern=\\[night\\]' : '--test-skip-pattern=\\[night\\]',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    `--test-reporter=${pathToFileURL(join(root, 'rig', 'report.ts')).href}`,
    '--test-reporter-destination=stdout',
    'tests/*.test.ts',
    'parts/*/tests/*.test.ts',
  ],
  { cwd: folder, stdio: 'inherit', env: { ...env, TENT_RUN: night ? 'night' : 'day' } },
)
if (ended.error) throw ended.error
process.exit(ended.status ?? 1)
