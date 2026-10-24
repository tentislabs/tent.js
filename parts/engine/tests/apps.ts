import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Caller } from '../../core/index.ts'
import type { Clock, Description, Loaded } from '../../core/internal.ts'
import { describe, describing, finish, write } from '../../core/internal.ts'
import type { App, Engine, EngineOptions, OpenOptions } from '../index.ts'
import { createEngine } from '../index.ts'

/** The caller that is the system. */
export const system: Caller = { kind: 'system' }

/** The caller that is nobody. */
export const nobody: Caller = { kind: 'nobody' }

/** A caller that is a user, with the id of its row and its roles. */
export const userOf = (id: string, roles: string[] = []): Caller => ({ kind: 'user', user: { id, roles } })

// The project that the tests of this part open: its files, as the builder of an app writes them.
const deskProject = fileURLToPath(new URL('./desk/', import.meta.url))
const teamsProject = fileURLToPath(new URL('./teams/', import.meta.url))
const files = ['tables.ts', 'functions.ts']

/** Makes an empty folder for one test, under the folder that git leaves out. It is removed when the test ends. */
export function workFolder(t: TestContext): string {
  const all = join(process.cwd(), 'results', 'engine')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'work-'))
  ended(t).folders.push(folder)
  return folder
}

// What each test made that is taken away when it ends: its engines, which are closed first, and then its folders.
const made = new WeakMap<TestContext, { engines: Engine[]; folders: string[] }>()

/** Answers what a test made so far. The first asking adds the one hook that takes it all away, also where the test fails. */
function ended(t: TestContext): { engines: Engine[]; folders: string[] } {
  const held = made.get(t)
  if (held) return held
  const mine: { engines: Engine[]; folders: string[] } = { engines: [], folders: [] }
  made.set(t, mine)
  t.after(async () => {
    for (const engine of mine.engines) await engine.close()
    for (const folder of mine.folders) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return mine
}

/** What a test may change of the bundle it is handed. */
export interface Bundling {
  // The project of the teams, which keeps a data file for each team, in place of the project of the desk.
  teams?: true
  // A project of the tests by the name of its folder, in place of the project of the desk.
  project?: string
  // What was read of the arrows of a definition, by its name and by the option: it is stored in place of its code.
  bodies?: Record<string, Record<string, object>>
  // Changes the description before it is written, as a hand would.
  change?: (description: Description) => void
  // The file of the project that holds its starter data, where the bundle has some.
  seed?: 'seed-list.ts' | 'seed-code.ts'
}

/** A bundle that a test made: its folder, which carries the version id, and its description. */
export interface Bundle {
  folder: string
  versionId: string
  description: Description
  text: string
}

/**
 * Makes a bundle of the project of the tests in a folder of the test, as the build would: the description, and the
 * files of the project as its server modules. No test of this part may use the build, so the definitions are made
 * by loading the files, and described by the function that the build describes them with.
 */
export async function bundled(t: TestContext, o: Bundling = {}, into: string = workFolder(t)): Promise<Bundle> {
  const definitions: Loaded[] = []
  const desk = o.project
    ? fileURLToPath(new URL(`./${o.project}/`, import.meta.url))
    : o.teams
      ? teamsProject
      : deskProject
  for (const file of files) {
    const given: Record<string, object> = await describing(() => import(pathToFileURL(join(desk, file)).href))
    for (const [exportName, value] of Object.entries(given)) {
      const bodies = o.bodies?.[exportName]
      definitions.push({ value, file, exportName, ...(bodies ? { bodies } : {}) })
    }
  }
  if (o.seed) {
    const given: Record<string, object> = await describing(() => import(pathToFileURL(join(desk, o.seed ?? '')).href))
    const bodies = o.bodies?.seed
    definitions.push({ value: given.default, file: 'seed.ts', ...(bodies ? { bodies } : {}) })
  }
  const { description, findings } = describe({ definitions })
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.message}`),
    [],
  )
  const done = finish(description, {
    modules: Object.fromEntries([...files, 'seed.ts'].map((file) => [file, `server/${file}`])),
    sources: {},
  })
  o.change?.(done)
  const { text, versionId } = write(done)
  const folder = join(into, 'bundles', versionId)
  mkdirSync(join(folder, 'server'), { recursive: true })
  writeFileSync(join(folder, 'description.json'), text)
  for (const file of files)
    writeFileSync(
      join(folder, 'server', file),
      `${readFileSync(join(desk, file), 'utf8')}\n${ruleExports(definitions, file).join('\n')}\n`,
    )
  if (o.seed) cpSync(join(desk, o.seed), join(folder, 'server', 'seed.ts'))
  return { folder, versionId, description: done, text }
}

/**
 * Answers the lines that give each rule which is code, of the definitions of one file, as an export of its own:
 * `<name>_access` for the rule of a function and `<table>_access_<what>` for a rule of a table, as the build
 * writes them into a module.
 */
function ruleExports(definitions: Loaded[], file: string): string[] {
  const isCode = (rule: unknown): boolean => typeof Reflect.get(Object(rule), 'code') === 'function'
  const lines: string[] = []
  for (const { value, exportName, file: from } of definitions) {
    if (from !== file || exportName === undefined) continue
    const name = String(Reflect.get(value, 'definition'))
    const access: unknown = Reflect.get(Object(Reflect.get(value, 'options')), 'access')
    if (isCode(access)) lines.push(`export const ${name}_access = ${exportName}.options.access.code`)
    for (const what of ['read', 'add', 'change', 'remove'])
      if (isCode(Reflect.get(Object(access), what)))
        lines.push(`export const ${name}_access_${what} = ${exportName}.options.access.${what}.code`)
  }
  return lines
}

/** Makes an engine that is closed when the test ends, also where the test fails. */
export function engineOf(t: TestContext, o: EngineOptions = {}): Engine {
  const engine = createEngine({ port: 0, ...o })
  ended(t).engines.push(engine)
  return engine
}

/** An app of the project of the tests, opened in an engine of its own on a data folder of the test. */
export interface Running {
  engine: Engine
  app: App
  bundle: Bundle
  dataFolder: string
  // The port that the engine listens on, and the address of the app on this computer.
  port: number
  origin: string
}

/** Answers the port that the engine of a data folder says it is reached on. */
export const portOf = (dataFolder: string): number =>
  Number(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).port)

/** Builds the bundle of the tests and opens it, in the mode `test` where the test names no other. */
export async function running(
  t: TestContext,
  o: Bundling & { engine?: EngineOptions; open?: Partial<OpenOptions> } = {},
): Promise<Running> {
  const work = workFolder(t)
  const bundle = await bundled(t, o, work)
  const engine = engineOf(t, o.engine)
  const dataFolder = join(work, 'data')
  const app = await engine.open(bundle.folder, { dataFolder, mode: 'test', ...o.open })
  const port = portOf(dataFolder)
  return { engine, app, bundle, dataFolder, port, origin: `http://localhost:${port}` }
}

/** What a request to the door was answered: the status, the headers, and the body as it was read from JSON. */
export interface Answered {
  status: number
  headers: Headers
  body: Record<string, unknown>
  // The wire error of an answer that is one, and an empty record otherwise.
  error: Record<string, unknown>
}

/** What a test says of the request it sends. A `body` stands in place of the JSON of `input`. */
export interface Sending {
  input?: unknown
  version?: string
  headers?: Record<string, string>
  from?: string
  method?: string
  body?: string | Uint8Array<ArrayBuffer>
}

/** Sends a call to an app through every step of the door, with no network, and answers what it was answered. */
export async function send(app: App, address: string, o: Sending = {}): Promise<Answered> {
  const method = o.method ?? 'POST'
  const written = JSON.stringify({ input: o.input ?? {}, ...(o.version === undefined ? {} : { version: o.version }) })
  const request = new Request(address, {
    method,
    headers: { 'content-type': 'application/json', ...o.headers },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: o.body ?? written }),
  })
  const response = await app.request(request, o.from === undefined ? {} : { from: o.from })
  const text = await response.text()
  let body: Record<string, unknown> = {}
  try {
    body = Object(JSON.parse(text))
  } catch {
    body = { text }
  }
  return { status: response.status, headers: response.headers, body, error: Object(body.error) }
}

/** Adds a user as the system, and answers a caller that is that user. */
export async function addUser(app: App, name: string, roles: string[] = [], salary?: number): Promise<Caller> {
  const row = await app.call('addUser', { name, roles, ...(salary === undefined ? {} : { salary }) }, { as: system })
  return userOf(String(Reflect.get(Object(row), 'id')), roles)
}

/** Answers the rows of one table of the log of a data folder, in the order they were written. */
export function logRows(dataFolder: string, table: string): Record<string, unknown>[] {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } finally {
    log.close()
  }
}

/** Answers the names of the columns of one table of the log of a data folder, in their order. */
export function logColumns(dataFolder: string, table: string): string[] {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log
      .prepare(`SELECT name FROM pragma_table_info('${table}')`)
      .all()
      .map((row) => String(row.name))
  } finally {
    log.close()
  }
}

/** Answers the code of what a promise is refused with, or nothing where it is kept. */
export async function codeOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : `no code: ${error}`
  }
  return undefined
}

/** Answers what a promise is refused with, and fails where it is kept. */
export async function refusal(work: Promise<unknown>): Promise<Record<string, unknown> & { message: string }> {
  try {
    await work
  } catch (error) {
    if (!(error instanceof Error)) throw error
    const told: Record<string, unknown> = Object(error)
    return Object.assign(told, { message: error.message })
  }
  throw new assert.AssertionError({ message: 'the call was answered, and it should have been refused' })
}

/** A clock that stands still until the test moves it: a timer is called when the time is moved to it or past it. */
export function testClock(start: number = Date.UTC(2031, 0, 1)): { clock: Clock; advance(ms: number): void } {
  let moment = start
  let timers: { at: number; run: () => void }[] = []
  const clock: Clock = {
    now: () => moment,
    setTimer(at, run) {
      const timer = { at, run }
      timers.push(timer)
      return () => {
        timers = timers.filter((one) => one !== timer)
      }
    },
  }
  const advance = (ms: number): void => {
    const to = moment + ms
    for (;;) {
      const due = timers.filter((one) => one.at <= to).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      timers = timers.filter((one) => one !== due)
      moment = Math.max(moment, due.at)
      due.run()
    }
    moment = to
  }
  return { clock, advance }
}
