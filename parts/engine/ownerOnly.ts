import { execFileSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { userInfo } from 'node:os'
import { windowsTool } from '../core/internal.ts'

/** The current user as the system's own program for rights names them: with the domain where the system gives one. */
function currentUser(): string {
  const { username } = userInfo()
  const domain = process.env.USERDOMAIN
  return domain ? `${domain}\\${username}` : username
}

/** What stands against taking a secret from a file, and how the file is closed to every user but the current one. */
export interface HeldAlone {
  // Why the file is not one that only the current user can read, or nothing where it is.
  why?: string
  // The command that closes the file, as a person types it.
  close: string
}

/**
 * Takes the path of a file that holds a secret, as a key. Answers whether it is kept as a secret is: an ordinary
 * file and no link, which the current user owns, and which no other user may read. Not a byte of the file is
 * read. Where the system tells the users of files apart by a number, the owner is held by it; on Windows the
 * rights that are stated on the file are read by the system's own program, and each that names another stands
 * against the file. Throws what the system refuses with where the file is not there.
 */
export function keptAlone(path: string): HeldAlone {
  const windows = process.platform === 'win32'
  // On Windows a right that was stated on the file itself stays when what it inherits is taken away: its rights are
  // made anew first.
  const close = windows
    ? `icacls "${path}" /reset, and then icacls "${path}" /inheritance:r /grant:r "${currentUser()}:F"`
    : `chmod 600 "${path}"`
  const about = lstatSync(path)
  if (about.isSymbolicLink()) return { why: 'it is a link, and a link may lead to a file of another user', close }
  if (!about.isFile()) return { why: 'it is no ordinary file', close }
  if (!windows) {
    if (typeof process.getuid === 'function' && about.uid !== process.getuid())
      return { why: 'the current user does not own it', close }
    return (about.mode & 0o077) === 0 ? { close } : { why: 'other users of this computer may read it', close }
  }
  const rights = execFileSync(windowsTool('icacls.exe'), [path], { encoding: 'utf8', windowsHide: true })
  const mine = `\\${userInfo().username.toLowerCase()}:`
  const others = rights
    .split(/\r?\n/)
    .filter((line) => /:\(/.test(line))
    .filter((line) => !line.toLowerCase().includes(mine))
  return others.length ? { why: 'other users of this computer may read it', close } : { close }
}
