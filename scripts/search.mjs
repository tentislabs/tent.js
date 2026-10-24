// Hands the search for what nothing uses the files it starts from and the files it holds, and carries it out.
// Run: node scripts/search.mjs [folder]      Ends as the search does: with 1 when a file or an export is used by nothing.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { heldFiles } from './held.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const folder = process.argv[2] ?? root

// The files of a sample app are found by their folders, and no import reaches them: the search leaves them out.
const held = heldFiles(folder).filter((file) => !file.startsWith('samples/'))
const entries = join(folder, 'parts', 'entries.json')
const entryFiles = existsSync(entries) ? Object.values(JSON.parse(readFileSync(entries, 'utf8'))) : []
// What the search starts from. What one of these gives counts as used, and so does what it imports.
const starts = held.filter(
  (file) =>
    /^(?:tests|parts\/[^/]+\/tests)\/[^/]+\.test\.ts$/.test(file) ||
    /^parts\/.+\/list\.ts$/.test(file) ||
    /^(?:scripts|rig)\//.test(file) ||
    /^docs\/[^/]+\.mjs$/.test(file),
)

const settings = mkdtempSync(join(tmpdir(), 'search-'))
writeFileSync(join(settings, 'knip.json'), JSON.stringify({ entry: [...entryFiles, ...starts], project: held }))
// The search leaves out what git leaves out, and a copy of a planted tree lies in such a folder: the held files are
// named one by one, so nothing else is held.
const ended = spawnSync(
  process.execPath,
  [
    join(root, 'node_modules', 'knip', 'bin', 'knip.js'),
    '--config',
    join(settings, 'knip.json'),
    '--directory',
    folder,
    '--include',
    'files,exports,types',
    '--no-gitignore',
    '--no-progress',
    '--no-config-hints',
  ],
  { stdio: 'inherit' },
)
rmSync(settings, { recursive: true, force: true })
if (ended.error) throw ended.error
if (ended.status === 0) console.log(`${held.length} files. Nothing found.`)
process.exit(ended.status ?? 1)
