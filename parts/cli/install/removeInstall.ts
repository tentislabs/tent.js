import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { TentError } from '../../core/index.ts'
import { installedItems } from './installedItems.ts'
import { pathOfUser, setPathOfUser } from './pathOfUser.ts'

// The start files of the shells, in which an installer of macOS or Linux wrote its one marked line.
const startFiles = ['.bashrc', '.zshrc', '.profile', '.zprofile', '.bash_profile']
const mark = '# tent.js'

/** Takes the marked line, and the line after it, out of each start file of the shells that holds it. */
function offTheStartFiles(): void {
  const own = homedir()
  for (const file of startFiles) {
    const path = join(own, file)
    if (!existsSync(path)) continue
    const lines = readFileSync(path, 'utf8').split('\n')
    const at = lines.indexOf(mark)
    if (at < 0) continue
    lines.splice(at, 2)
    writeFileSync(path, lines.join('\n'))
  }
  const fish = join(own, '.config', 'fish', 'conf.d', 'tent.fish')
  if (existsSync(fish) && readFileSync(fish, 'utf8').startsWith(mark)) rmSync(fish)
}

/** Takes the folder of the install off the path of the current user of Windows, and tells open programs that it changed. */
function offThePathOfWindows(bin: string): void {
  const value = pathOfUser()
  if (value === undefined) return
  const kept = value.split(';').filter((one) => one !== '' && resolve(one).toLowerCase() !== resolve(bin).toLowerCase())
  if (kept.join(';') !== value) setPathOfUser(kept.join(';'))
}

/** Whether any program still holds one of the paths: a program file of Windows that runs cannot be removed. */
function removable(paths: string[]): string[] {
  const left: string[] = []
  for (const path of paths)
    try {
      rmSync(path, { recursive: true, force: true })
    } catch {
      left.push(path)
    }
  return left
}

/**
 * Takes away what a program file that still runs holds, once it has ended: on Windows the runtime and the launcher
 * of the command that removes the install run from inside it. The system's own shell of commands is left to take
 * them away: it tries again each second for a minute, and then ends.
 */
function removedLater(paths: string[], folder: string): void {
  const gone = paths.map((one) => `if not exist "${one}" `).join('')
  const each = paths.map((one) => `rmdir /s /q "${one}" 2>nul & del /f /q "${one}" 2>nul`).join(' & ')
  const line = `for /l %i in (1,1,60) do @(ping -n 2 127.0.0.1 >nul & ${each} & ${gone}(rmdir "${folder}" 2>nul & exit))`
  const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true,
  })
  child.unref()
}

/**
 * Takes the folder of an install. Removes the install: takes `bin/` off the path of the person's terminals, and
 * removes each thing the install keeps in its folder, and the folder itself once it is empty. What a program that
 * runs from it holds - on Windows the runtime of the very command that removes it - goes once that program has
 * ended. Throws T0013 for a folder that holds no install.
 */
export async function removeInstall(home: string): Promise<void> {
  const folder = resolve(home)
  if (!existsSync(join(folder, 'current')) && !existsSync(join(folder, 'versions')))
    throw new TentError('T0013', `${folder} holds no install of Tent.js: nothing was removed.`, {
      fix: 'Name the folder of the install with TENT_HOME.',
    })
  if (process.platform === 'win32') offThePathOfWindows(join(folder, 'bin'))
  else offTheStartFiles()
  const items = readdirSync(folder)
    .filter((one) => installedItems.includes(one))
    .map((one) => join(folder, one))
  const left = removable(items)
  if (left.length && process.platform === 'win32') removedLater(left, folder)
  else if (left.length)
    throw new TentError('T0013', `${left.join(', ')} could not be removed.`, { fix: 'Remove them by hand.' })
  if (!left.length && readdirSync(folder).length === 0) rmSync(folder, { recursive: true, force: true })
}
