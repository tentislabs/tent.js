import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import type { TestApp, TestReader } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** A moment of the runtime, in which what the links carry arrives and is taken. */
export const moment = (ms = 5): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Waits until something holds, for some moments at the most, and fails with its name where it never does. */
export async function until(what: string, holds: () => boolean | Promise<boolean>, tries = 400): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await holds()) return
    await moment()
  }
  assert.fail(`never: ${what}`)
}

/** Moves the clock of the machines one beat on, and lets what the beat sent arrive. */
export async function beat(app: TestApp, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    app.clock.advance('1 second')
    await moment(15)
  }
}

/**
 * Has the beats of the machines pass until each of those readers is current. A beat and its answer cross in a
 * moment: where they did not within some beats, the computer is slow, and each later beat is given a longer one,
 * so that an answer is not older than a reader may be behind when it arrives.
 */
export async function current(app: TestApp, ...readers: TestApp[]): Promise<void> {
  for (let i = 0; i < 80 && !readers.every((one) => one.at().current); i++) {
    app.clock.advance('1 second')
    await moment(i < 8 ? 15 : 100)
  }
  for (const one of readers) assert.equal(one.at().current, true, 'a reader is current after its beats')
}

/**
 * Waits until each of those readers holds every write of the writer, and was told that the newest one is settled.
 * The writer is read anew each time: what it counts, and what its readers hand it of their counts, it writes meanwhile.
 */
export async function level(app: TestApp, ...readers: TestApp[]): Promise<void> {
  await until('the readers hold what the writer holds, and know it settled', () => {
    const n = app.at().n
    return readers.every((one) => one.at().n === n && one.at().settled === n)
  })
}

/** A writer with its readers: the test app of the project of the machines, closed when the test ends. */
export interface Machines {
  app: TestApp
  near: TestReader
  far: TestReader
}

// The temporary place of each test, in which its test app keeps the folders of its machines.
const temps = new WeakMap<TestContext, string>()

// The copy of the project that each test builds its test app from.
const projects = new WeakMap<TestContext, string>()

/** The folder of the project of a test, which the test may change to build another version of it. */
export const projectOf = (t: TestContext): string => projects.get(t) ?? ''

/** Opens the test app of the machines, with no reader yet. */
export async function writerOf(t: TestContext, changed?: (folder: string) => void): Promise<TestApp> {
  temps.set(t, temps.get(t) ?? tempOf(t))
  const folder = copyOf(t, 'many')
  projects.set(t, folder)
  // A test may change the copy of the project before the first version is built from it.
  changed?.(folder)
  const app = await testApp({ folder })
  closing(t, () => app.close())
  return app
}

/**
 * The data folder of a machine of the test: `data` for the app that `testApp` answered, and `reader-<n>` for the
 * readers, counted from 2 in the order they were made.
 */
export function folderOf(t: TestContext, name: string): string {
  const temp = temps.get(t) ?? ''
  const [home] = readdirSync(temp).filter((one) => one.startsWith('tent-test-'))
  return join(temp, home ?? '', name)
}

/** Answers the rows of one table of the log of a machine, in the order they were written. */
export function logRows(t: TestContext, name: string, table: string): Record<string, unknown>[] {
  const log = new DatabaseSync(join(folderOf(t, name), 'logs.db'), { readOnly: true })
  try {
    return log.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } finally {
    log.close()
  }
}

/** How many calls of a name the log of a machine holds. */
export const callsOf = (t: TestContext, machine: string, name: string): number =>
  logRows(t, machine, 'calls').filter((row) => row.name === name).length

/** Opens a writer, a near reader and a far reader, joined over the link and current. */
export async function machinesOf(t: TestContext, changed?: (folder: string) => void): Promise<Machines> {
  const app = await writerOf(t, changed)
  const near = await app.reader()
  const far = await app.reader({ far: true })
  await current(app, near, far)
  return { app, near, far }
}

/** What a request to a machine was answered: its status, its value or the code of its error, and its headers. */
export interface MachineAnswer {
  status: number
  value: unknown
  code: string | undefined
  headers: Headers
  error: Record<string, unknown>
}

let senders = 0

/** Sends a call to a machine as a request of the web, with no network, from an address of its own. */
export async function send(
  app: TestApp,
  name: string,
  input: unknown = {},
  o: { headers?: Record<string, string>; path?: string; method?: string; version?: string } = {},
): Promise<MachineAnswer> {
  const from = `10.9.${Math.floor(++senders / 250)}.${senders % 250}`
  const method = o.method ?? 'POST'
  const request = new Request(`https://many.test${o.path ?? `/_t/call/${name}`}`, {
    method,
    headers: { 'content-type': 'application/json', ...o.headers },
    ...(method === 'GET'
      ? {}
      : { body: JSON.stringify({ input, ...(o.version === undefined ? {} : { version: o.version }) }) }),
  })
  const response = await app.request(request, { from })
  const body: Record<string, unknown> = Object(await response.json().catch(() => ({})))
  const error: Record<string, unknown> = Object(body.error)
  const code = typeof error.code === 'string' ? error.code : undefined
  return { status: response.status, value: body.value, code, headers: response.headers, error }
}

/** The titles of the orders that a machine holds, in the order they were added. */
export const titles = async (app: TestApp): Promise<string[]> =>
  (await app.rows('orders')).map((row) => String(row.title))

/** Answers the code of what a promise is refused with, or nothing where it is kept. */
export async function codeOf(work: Promise<unknown> | (() => unknown)): Promise<string | undefined> {
  try {
    await (typeof work === 'function' ? work() : work)
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : `no code: ${error}`
  }
  return undefined
}
