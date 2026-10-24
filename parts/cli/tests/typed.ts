import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { userInfo } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import type { TestContext } from 'node:test'
import { tent } from '../shell.ts'

/** The root of the repository. */
export const root = join(import.meta.dirname, '..', '..', '..')

/** The file of the shell, which a test starts as a program of its own. */
export const shell = join(import.meta.dirname, '..', 'shell.ts')

/**
 * Copies a project into an empty folder of its own under `results/`, and answers the place of the copy. The
 * project is one that lies beside these tests, by its name, or any folder, by its whole path. The folder is
 * removed when the test ends, after what the test started has ended.
 */
export function copied(t: TestContext, name: string, project = 'shop'): string {
  const folder = join(root, 'results', 'cli', name)
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  mkdirSync(folder, { recursive: true })
  const copy = join(folder, basename(project))
  cpSync(isAbsolute(project) ? project : join(import.meta.dirname, project), copy, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  return copy
}

/** Closes a file to every user but the current one, as the system of this computer does it. */
export function closed(file: string): void {
  if (process.platform !== 'win32') {
    chmodSync(file, 0o600)
    return
  }
  const { username } = userInfo()
  const user = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${username}` : username
  execFileSync('icacls', [file, '/reset'], { stdio: 'ignore' })
  execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${user}:F`], { stdio: 'ignore' })
}

/** What a command printed and the number it ended with, and what it printed read as JSON where it is some. */
export interface Typed {
  ended: number
  printed: string
  answer: {
    ok?: boolean
    value?: unknown
    findings?: {
      code: string
      level: string
      message: string
      fix?: string
      where?: { file: string; line: number; definition?: string }
    }[]
  }
}

/** Carries a command out in a folder, in this program, and answers what it printed and the number it ended with. */
export async function typed(folder: string, ...words: string[]): Promise<Typed> {
  const lines: string[] = []
  const ended = await tent(words, { folder, out: (line) => lines.push(line) })
  const printed = lines.join('\n')
  let answer: Typed['answer'] = {}
  try {
    answer = Object(JSON.parse(printed))
  } catch {
    // What is printed as text is read by the test as text.
  }
  return { ended, printed, answer }
}

/** Carries a command out as a person types it: as a program of its own, which must end by itself. */
export function program(cwd: string, ...words: string[]): { status: number | null; out: string; err: string } {
  // The runner carries out no file for a program that it finds this in, as it would in a test that a test started.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const ended = spawnSync(process.execPath, [shell, ...words], { cwd, encoding: 'utf8', timeout: 60_000, env })
  return { status: ended.status, out: ended.stdout, err: ended.stderr }
}

/** Carries a command out as a program of its own, and answers it as `typed` answers one that ran in this program. */
export function typedApart(cwd: string, ...words: string[]): Typed {
  const ended = program(cwd, ...words)
  let answer: Typed['answer'] = {}
  try {
    answer = Object(JSON.parse(ended.out))
  } catch {
    // What is printed as text is read by the test as text.
  }
  return { ended: ended.status ?? -1, printed: ended.out + ended.err, answer }
}
