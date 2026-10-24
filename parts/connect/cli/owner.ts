import { execFileSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { currentSid, windowsTool } from '../../core/internal.ts'

// A start of the tool that reads an owner takes hundreds of milliseconds, and one command reads its files many times:
// what was found of a file is kept while the file is the same one, with the same times of its writing and its rights.
const owners = new Map<string, boolean>()

/**
 * Whether a path is an ordinary file that the current user owns: by the number of the user where the system gives
 * one, and on Windows by the owner of the file as the system's own tools read it. A link, a folder, a file that is
 * not there and one that cannot be read are owned by nobody here.
 */
export function ownedHere(path: string): boolean {
  try {
    const about = lstatSync(path, { bigint: true })
    if (!about.isFile()) return false
    if (process.platform !== 'win32')
      return typeof process.getuid !== 'function' || about.uid === BigInt(process.getuid())
    const same = [path, about.dev, about.ino, about.size, about.mtimeNs, about.ctimeNs, about.birthtimeNs].join(
      '\u0000',
    )
    const known = owners.get(same)
    if (known !== undefined) return known
    // The path reaches the tool as a value of its environment, so that no character of it is read as a command.
    const owner = execFileSync(
      windowsTool('WindowsPowerShell', 'v1.0', 'powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(Get-Acl -LiteralPath $env:TENT_OWNED).GetOwner([System.Security.Principal.SecurityIdentifier]).Value',
      ],
      { encoding: 'utf8', windowsHide: true, env: { ...process.env, TENT_OWNED: path } },
    ).trim()
    const owned = owner !== '' && owner === currentSid()
    owners.set(same, owned)
    return owned
  } catch {
    return false
  }
}
