// The program of the player that the launcher starts: the runtime's cache of compiled code turned on, a mark that a
// program runs from this version, what the command asks of the system first, and then the command line of the
// framework with the words it was handed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import module from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const player = dirname(fileURLToPath(import.meta.url))
// The cache lies beside the release, so that a second start reads the code it compiled once.
module.enableCompileCache?.(join(player, '.cache'))
// An update removes no version that a program still runs from: each program is named by its process in `running/`.
// Under the npm door the version is npm's, which updates it itself: nothing is written into its package.
const running = join(player, '..', 'running')
if (!player.split(/[\\/]/).includes('node_modules'))
  try {
    mkdirSync(running, { recursive: true })
    writeFileSync(join(running, String(process.pid)), '')
    process.on('exit', () => rmSync(join(running, String(process.pid)), { force: true }))
  } catch {
    // A version that cannot be marked runs all the same: the next update may then remove it after this one.
  }
const words = process.argv.slice(2)
// What the command asks of the system first is begun before the parts are loaded, and runs beside their loading.
const { askFirst } = await import('./parts/cli/askFirst.js')
askFirst(words)
const { tent } = await import('./parts/cli/shell.js')
process.exitCode = await tent(words)
