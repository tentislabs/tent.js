import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { project } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import type { History, Point } from '../index.ts'
import { openHistory } from '../index.ts'

/** A person who writes the points of a test. */
export const ada = { kind: 'person', id: 'ada' } as const

/** The length of a day, in milliseconds. */
export const day = 86_400_000

// The histories that a test opened on each of its folders: each is closed before its folder is removed.
const opened = new Map<string, History[]>()

/** Makes an empty folder for one test, under the folder that git leaves out. It is removed when the test ends. */
export function workFolder(t: TestContext): string {
  const all = join(process.cwd(), 'results', 'history')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'work-'))
  opened.set(folder, [])
  t.after(() => {
    for (const history of opened.get(folder) ?? []) history.close()
    opened.delete(folder)
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return folder
}

/** Opens the history of a folder that lies in a folder of the test. It is closed before that folder is removed. */
export function openedIn(folder: string): History {
  const history = openHistory(folder)
  for (const [work, all] of opened) if (folder.startsWith(work)) all.push(history)
  return history
}

/**
 * Makes the folder of a project inside a folder of the test, with the engine's own folder in it, and opens the
 * history there. Answers the folder of the project and the history, which is closed when the test ends.
 */
export function started(
  t: TestContext,
  files: Record<string, string | Uint8Array> = {},
  name = 'project',
): { project: string; history: History; data: string } {
  const folder = workFolder(t)
  const lies = join(folder, name)
  mkdirSync(lies, { recursive: true })
  for (const [path, content] of Object.entries(files)) put(lies, path, content)
  const data = join(lies, '.tent')
  return { project: lies, history: openedIn(data), data }
}

/** Writes one file of a project, with the folders above it. */
export function put(project: string, path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(join(project, path)), { recursive: true })
  writeFileSync(join(project, path), content)
}

/** Every file under a folder, by its path with `/`, as the hex of its bytes. */
export function filesIn(folder: string, at = ''): Record<string, string> {
  const found: Record<string, string> = {}
  for (const entry of readdirSync(join(folder, at), { withFileTypes: true })) {
    const path = at ? `${at}/${entry.name}` : entry.name
    if (entry.isDirectory()) Object.assign(found, filesIn(folder, path))
    else found[path] = readFileSync(join(folder, path)).toString('hex')
  }
  return found
}

/** The files of a project that a point may hold: all but those of the engine's own folder and of the packages. */
export const heldIn = (project: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(filesIn(project)).filter(
      ([path]) => !path.startsWith('.tent/') && !path.startsWith('node_modules/'),
    ),
  )

/** The fingerprint of bytes or of a text, as the history keeps it. */
export const fingerprintOf = (content: string | Uint8Array): string =>
  createHash('sha256').update(content).digest('hex')

/** A value as JSON with the keys of every map sorted and no spaces: what the id of a point is taken over. */
function compact(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(compact).join(',')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  const keys = Object.keys(value)
    .filter((key) => Reflect.get(value, key) !== undefined)
    .sort((a, b) => (a < b ? -1 : 1))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${compact(Reflect.get(value, key))}`).join(',')}}`
}

/** The id that the public rule gives a point: the first 32 characters of the fingerprint of its record. */
export function idOf(point: Omit<Point, 'id'>): string {
  const { at, by, files, kind, name, parents } = point
  return fingerprintOf(compact({ at, by, files, kind, name, parents })).slice(0, 32)
}

/** A point that a test makes by hand, with the id that the public rule gives it. */
export const pointOf = (point: Omit<Point, 'id'>): Point => ({ ...point, id: idOf(point) })

/** The description of a project that states the given options and nothing else. */
export function described(options: Parameters<typeof project>[1] = {}): Description {
  const { description, findings } = describe({ definitions: [{ value: project('shop', options) }] })
  if (findings.length) throw new Error(findings.map((one) => one.message).join('\n'))
  return description
}

/** Answers the code of what a call throws, or nothing where it throws no error with a code. */
export function codeOf(call: () => unknown): string | undefined {
  try {
    call()
  } catch (error) {
    const code: unknown = error instanceof Error ? Reflect.get(error, 'code') : undefined
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}
