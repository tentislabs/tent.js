import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'

// What each test made that is taken away when it ends: what it opened, which is closed first, and then its folders.
const made = new WeakMap<TestContext, { closes: (() => unknown)[]; folders: string[] }>()

/** Answers what a test made so far. The first asking adds the one hook that takes it all away, also where the test fails. */
function ended(t: TestContext): { closes: (() => unknown)[]; folders: string[] } {
  const held = made.get(t)
  if (held) return held
  const mine: { closes: (() => unknown)[]; folders: string[] } = { closes: [], folders: [] }
  made.set(t, mine)
  t.after(async () => {
    for (const close of mine.closes.reverse()) await close()
    for (const folder of mine.folders) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return mine
}

/** Has a thing that a test opened closed when the test ends, before the folders of the test are removed. */
export const closing = (t: TestContext, close: () => unknown): void => void ended(t).closes.push(close)

/** Makes an empty folder for one test, under the folder that git leaves out. It is removed when the test ends. */
function workFolder(t: TestContext): string {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'work-'))
  ended(t).folders.push(folder)
  return folder
}

/**
 * Copies a project of the tests into a folder of the test, where a build may write beside its files, and answers
 * the place of the copy.
 */
export function copyOf(t: TestContext, name: string): string {
  const copy = join(workFolder(t), name)
  cpSync(join(import.meta.dirname, name), copy, { recursive: true })
  return copy
}

// The names by which the three systems tell a program where its temporary files go.
const names = ['TEMP', 'TMP', 'TMPDIR']

/**
 * Points the temporary place of this program at an empty folder of the test, and answers the folder. So a test
 * sees what a helper left there, and nothing of it lies outside the folder that the test was given. The place is
 * as it was when the test ends.
 */
export function tempOf(t: TestContext): string {
  const folder = join(workFolder(t), 'temp')
  mkdirSync(folder)
  const was = names.map((name) => process.env[name])
  for (const name of names) process.env[name] = folder
  closing(t, () => {
    for (const [i, name] of names.entries())
      if (was[i] === undefined) delete process.env[name]
      else process.env[name] = was[i]
  })
  return folder
}

/** Every file under a folder, by its path from the folder, written with `/`, in the order of the names. */
export function filesIn(folder: string, path = ''): string[] {
  const found: string[] = []
  for (const name of readdirSync(join(folder, path)).sort()) {
    const below = path ? `${path}/${name}` : name
    if (statSync(join(folder, below)).isDirectory()) found.push(...filesIn(folder, below))
    else found.push(below)
  }
  return found
}
