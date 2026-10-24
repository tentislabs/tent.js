import { execFile, execFileSync } from 'node:child_process'
import { closeSync, openSync, renameSync, rmSync, writeSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'

/**
 * Takes the path of a program of Windows inside the folder of the system. Answers its whole path: a program of the
 * same name that the path of the person finds first is never run. Read at each call, so a room with no process loads it.
 */
export const windowsTool = (...names: string[]): string =>
  join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', ...names)

/** What Windows says of the account that this program runs as: the id of its user, and the level of its rights. */
type Account = { sid: string | undefined; level: number }

let account: Account | undefined
let asked: Promise<void> | undefined

/** The system's own program that tells the account, with its words: one run tells both, which a start would pay twice. */
const whoami = (): [string, string[]] => [windowsTool('whoami.exe'), ['/user', '/groups', '/fo', 'csv', '/nh']]

/** The account in what the system's own program answered. */
function accountIn(lines: string): Account {
  // The user stands on the first line. The level is the group of a label, `S-1-16-<level>`, whose name is in the
  // language of the system and whose id is the same in every one.
  const sid = /"(S-1-[\d-]+)"/.exec(lines.split('\n')[0] ?? '')?.[1]
  return { sid, level: Number(/"S-1-16-(\d+)"/.exec(lines)?.[1] ?? 0) }
}

/**
 * Begins to ask Windows for the account that this program runs as, so that the system's own program runs beside
 * what this program does meanwhile, as the loading of its parts. Answers once the account is known, with the same
 * promise at each call, and rejects with what the system refused with. The account is kept by this program alone.
 */
export function askAccount(): Promise<void> {
  if (asked !== undefined) return asked
  const [program, words] = whoami()
  asked = new Promise((done, failed) => {
    execFile(program, words, { encoding: 'utf8', windowsHide: true }, (error, lines) => {
      if (error) failed(error)
      else {
        account = accountIn(lines)
        done()
      }
    })
  })
  // An ask that nothing waits for, as that of a command that was mistyped, ends the program with no error of its own.
  asked.catch(() => undefined)
  return asked
}

/** The account as an ask that was answered told it, or else read at once by one run of the system's own program. */
function accountOf(): Account {
  if (account !== undefined) return account
  const [program, words] = whoami()
  account = accountIn(execFileSync(program, words, { encoding: 'utf8', windowsHide: true }))
  return account
}

/** The id that Windows gives the current user, which names one user wherever the account lives. */
export function currentSid(): string | undefined {
  return accountOf().sid
}

/**
 * Whether this program runs with an administrator's rights on Windows: the level of its rights is high or above, as
 * a program that was raised has, and never one that an administrator started without raising it.
 */
export function runsElevated(): boolean {
  return accountOf().level >= 12288
}

/** The words of the system's own program that take away what a path inherits and leave the current user alone. */
function closingWords(path: string): string[] {
  const user = currentSid()
  return [path, '/inheritance:r', '/grant:r', `${user ? `*${user}` : userInfo().username}:F`]
}

/**
 * Takes the path of a file and its text or its bytes. Makes the file anew, so that only the current user can read
 * it. What stood in its place is removed first: a link is removed as a link, and never what it leads to. The new
 * file is made so that the making fails where something lies there, with the rights of the current user alone
 * stated on it before a byte is written: by its mode, and on Windows, where the modes of the runtime change
 * nothing, by the system's own program, which takes away what the new file has from its folder. The text is
 * written through the hold on the file, and through no name. Throws what the system refuses with.
 */
export function writeOwnerOnly(path: string, text: string | Uint8Array): void {
  rmSync(path, { force: true })
  // `wx`: the file is made, and the making fails where a file, a folder or a link lies there.
  const file = openSync(path, 'wx', 0o600)
  try {
    if (process.platform === 'win32')
      execFileSync(windowsTool('icacls.exe'), closingWords(path), { stdio: 'ignore', windowsHide: true })
    if (typeof text === 'string') writeSync(file, text)
    else writeSync(file, text)
  } finally {
    closeSync(file)
  }
}

/** A file that only the current user can read, begun while its rights are closed, and written once they are. */
export interface OwnerOnlyBegun {
  /** Writes the text once the rights are closed, and puts the file in its place. Throws what the system refused with. */
  write(text: string): Promise<void>
  /** Takes away what was begun and not written. */
  drop(): void
}

/**
 * Takes the path of a file. Begins it as `writeOwnerOnly` makes one, under the path with `.new` after it, and closes
 * its rights beside what this program does meanwhile: on Windows the system's own program runs while this one goes
 * on. Answers what writes the text once that program has ended, and only then puts the file whole in the place of
 * the path, in one step that replaces what stood there, a link as a link: so the path never names a file without
 * its text, nor its text before its rights are the current user's alone. Throws what the system refuses with.
 */
export function beginOwnerOnly(path: string): OwnerOnlyBegun {
  const begun = `${path}.new`
  // What a program that ended in the middle left there is written by nobody now.
  rmSync(begun, { force: true })
  const file = openSync(begun, 'wx', 0o600)
  let open = true
  const close = (): void => {
    if (open) closeSync(file)
    open = false
  }
  const closed =
    process.platform === 'win32'
      ? askAccount().then(
          () =>
            new Promise<void>((done, failed) => {
              execFile(windowsTool('icacls.exe'), closingWords(begun), { windowsHide: true }, (error) =>
                error ? failed(error) : done(),
              )
            }),
        )
      : Promise.resolve()
  // A file that is dropped is not waited for: its closing may fail as it goes.
  closed.catch(() => undefined)
  return {
    async write(text) {
      try {
        await closed
        writeSync(file, text)
      } finally {
        close()
      }
      renameSync(begun, path)
    },
    drop() {
      close()
      rmSync(begun, { force: true })
    },
  }
}
