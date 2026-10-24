import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appCommand, isStored } from '../core/internal.ts'
import { runnerFolder } from '../engine/index.ts'

/**
 * Takes the folder of the install. Answers the tent program that a launcher starts, for macOS and Linux and for
 * Windows: the install's own launcher in `bin/`, which outlives every version. A player that runs from its files
 * with no install, as from the repository, is itself the runtime with its shell, and is named so.
 */
function tentProgram(home: string): { unix: string; windows: string } {
  const own = `"${process.execPath}" "${fileURLToPath(new URL('./shell.ts', import.meta.url))}"`
  const at = (name: string): string => (existsSync(join(home, 'bin', name)) ? `"${join(home, 'bin', name)}"` : own)
  return { unix: at('tent'), windows: at('tent.exe') }
}

/**
 * Takes a folder, the name of an app's command, the target it runs (the folder of a project or the address of a
 * server) and the folder of the install. Writes its launcher there: a file of that name for macOS and Linux, marked
 * as runnable, and one that ends in `.cmd` for Windows. Each is two lines, and holds no key and no code of the app.
 */
export function writeLauncher(folder: string, name: string, target: string, home: string): void {
  const program = tentProgram(home)
  mkdirSync(folder, { recursive: true })
  const unix = join(folder, name)
  writeFileSync(unix, `#!/bin/sh\nexec ${program.unix} cli "${target}" "$@"\n`)
  if (process.platform !== 'win32') chmodSync(unix, 0o755)
  writeFileSync(join(folder, `${name}.cmd`), `@echo off\r\n${program.windows} cli "${target}" %*\r\n`)
}

/**
 * Takes the folder of a project and the bundle that was built of it. Writes the launcher of its commands into
 * `.tent/bin/`, named after the app's command: for a project that offers something to `cli` or holds a `command`,
 * and for no other, since an app with no command has no launcher.
 */
export function launchProject(project: string, bundle: string): void {
  const description: unknown = JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8'))
  if (!isStored(description)) return
  const offered = (group: unknown): boolean =>
    isStored(group) &&
    Object.values(group).some((one) => isStored(one) && Array.isArray(one.offer) && one.offer.includes('cli'))
  const commands = isStored(description.commands) ? Object.keys(description.commands).length : 0
  if (!offered(description.functions) && !offered(description.flows) && !commands) return
  const name = appCommand(
    String(Reflect.get(Object(description.app), 'name')),
    Reflect.get(Object(description.project), 'cli'),
  )
  writeLauncher(join(project, '.tent', 'bin'), name, project, runnerFolder())
}
