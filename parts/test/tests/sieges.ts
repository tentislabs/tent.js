import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingHttpHeaders } from 'node:http'
import { request as httpRequest } from 'node:http'
import type { Socket } from 'node:net'
import { connect } from 'node:net'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Caller } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import type { App, Engine, EngineOptions, OpenOptions } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { closing, copyOf } from './projects.ts'

/** The caller that is the system, and the caller that is nobody. */
export const asSystem: { as: Caller } = { as: { kind: 'system' } }
export const asNobody: { as: Caller } = { as: { kind: 'nobody' } }

/** A caller that is a user, by the id of its row and its roles. */
export const asUser = (id: string, roles: string[] = []): { as: Caller } => ({
  as: { kind: 'user', user: { id, roles } },
})

/** A clock that stands still until an attack moves it: a timer is called when the time is moved to it or past it. */
interface StillClock {
  clock: Clock
  advance(ms: number): void
}

function stillClock(start: number = Date.UTC(2032, 0, 1)): StillClock {
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

// The bundle of the project under attack, built once for a file of tests and removed when its program ends.
let built: Promise<string> | undefined

function builtOnce(): Promise<string> {
  built ??= (async () => {
    const all = join(process.cwd(), 'results', 'test')
    mkdirSync(all, { recursive: true })
    const folder = mkdtempSync(join(all, 'siege-'))
    process.once('exit', () => rmSync(folder, { recursive: true, force: true }))
    const project = join(folder, 'siege')
    cpSync(join(import.meta.dirname, 'siege'), project, { recursive: true })
    const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
    assert.deepEqual(
      made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
      [],
    )
    return made.bundleFolder
  })()
  return built
}

/** A description as a hand changes it: a record of records. */
export type ByHand = Record<string, Record<string, Record<string, unknown>>>

/**
 * Answers the folder of a bundle of the project under attack, in a folder of the test. `change` changes its
 * description first, as a hand would: the limits of the project, or a stored form that no build writes.
 */
export async function siegeBundle(t: TestContext, change?: (description: ByHand) => void): Promise<string> {
  const bundle = join(copyOf(t, 'bare'), 'bundle')
  cpSync(await builtOnce(), bundle, { recursive: true })
  if (change) {
    const file = join(bundle, 'description.json')
    const description: ByHand = JSON.parse(readFileSync(file, 'utf8'))
    change(description)
    writeFileSync(file, JSON.stringify(description))
  }
  return bundle
}

/** The app under attack, in an engine of its own on a data folder of the test. */
export interface Siege {
  engine: Engine
  app: App
  bundle: string
  dataFolder: string
  // The port that the engine listens on, and the address of the app on this computer.
  port: number
  origin: string
  // The admin token of the engine, as `engine.json` holds it.
  token: string
  clock: StillClock
}

/** What an attack says of the app it is tried on. */
export interface Sieging {
  engine?: EngineOptions
  open?: Partial<OpenOptions>
  // The limits of the project, as they are stored: a time in milliseconds, a size in bytes, a count as it is.
  limits?: Record<string, number>
  change?: (description: ByHand) => void
  // A bundle that the test made already, in place of a new one.
  bundle?: string
  // A data folder that the test names, in place of a new one.
  dataFolder?: string
}

/** Opens the app under attack, in the mode `live` where the attack names no other. It is closed when the test ends. */
export async function besieged(t: TestContext, o: Sieging = {}): Promise<Siege> {
  const bundle =
    o.bundle ??
    (await siegeBundle(t, (description) => {
      Object.assign(description.project, { limits: { ...description.project.limits, ...o.limits } })
      o.change?.(description)
    }))
  const clock = stillClock()
  const engine = createEngine({ port: 0, ...o.engine, makers: { clock: () => clock.clock, ...o.engine?.makers } })
  closing(t, () => engine.close())
  const dataFolder = o.dataFolder ?? join(bundle, '..', 'data')
  const app = await engine.open(bundle, { dataFolder, mode: 'live', ...o.open })
  const { port, token } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  return { engine, app, bundle, dataFolder, port, origin: `http://localhost:${port}`, token, clock }
}

/** What a request was answered: the status, the headers, the body as text and as it was read from JSON. */
export interface Wired {
  status: number
  headers: Record<string, string>
  text: string
  body: Record<string, unknown>
  // The wire error of an answer that is one, and an empty record otherwise.
  error: Record<string, unknown>
}

function wiredOf(status: number, headers: Record<string, string>, text: string): Wired {
  let body: Record<string, unknown> = {}
  try {
    body = Object(JSON.parse(text))
  } catch {
    body = {}
  }
  return { status, headers, text, body, error: Object(body.error) }
}

/** What an attack says of one request. `input` is sent as the JSON of a call where no `body` stands in its place. */
export interface Asking {
  method?: string
  path?: string
  host?: string
  headers?: Record<string, string>
  input?: unknown
  // The user that the page of a signed-in browser names, which a call or a read of it states beside its input.
  as?: string
  body?: string | Uint8Array<ArrayBuffer>
  from?: string
  // The address of this computer that a request over a real connection is sent to, where it is not 127.0.0.1.
  via?: string
}

const flat = (headers: IncomingHttpHeaders): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, [value].flat().join(', ')]))

/** Sends one request to the engine of a siege over a real connection, and answers what it was answered. */
export function wire(siege: Pick<Siege, 'port'>, o: Asking = {}): Promise<Wired> {
  const method = o.method ?? 'POST'
  const body =
    o.body ??
    (method === 'GET' || method === 'HEAD'
      ? undefined
      : JSON.stringify({ input: o.input ?? {}, ...(o.as === undefined ? {} : { as: o.as }) }))
  return new Promise((done, failed) => {
    const sent = httpRequest(
      {
        host: o.via ?? '127.0.0.1',
        port: siege.port,
        path: o.path ?? '/',
        method,
        headers: {
          host: o.host ?? `localhost:${siege.port}`,
          'content-type': 'application/json',
          ...(body === undefined ? {} : { 'content-length': String(Buffer.byteLength(body)) }),
          ...o.headers,
        },
        agent: false,
      },
      (answer) => {
        const parts: Buffer[] = []
        answer.on('data', (part: Buffer) => parts.push(part))
        answer.on('end', () =>
          done(wiredOf(answer.statusCode ?? 0, flat(answer.headers), Buffer.concat(parts).toString('utf8'))),
        )
      },
    )
    sent.setTimeout(20_000, () => sent.destroy(new Error('the engine did not answer within twenty seconds')))
    sent.on('error', failed)
    sent.end(body)
  })
}

/** Sends one request to an app through every step of the door, with no network, and answers what it was answered. */
export async function asked(app: App, origin: string, o: Asking = {}): Promise<Wired> {
  const method = o.method ?? 'POST'
  const body =
    o.body ??
    (method === 'GET' || method === 'HEAD'
      ? undefined
      : JSON.stringify({ input: o.input ?? {}, ...(o.as === undefined ? {} : { as: o.as }) }))
  const request = new Request(`${origin}${o.path ?? '/'}`, {
    method,
    headers: { 'content-type': 'application/json', ...o.headers },
    ...(body === undefined ? {} : { body }),
  })
  const response = await app.request(request, o.from === undefined ? {} : { from: o.from })
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    headers[name] = value
  })
  return wiredOf(response.status, headers, await response.text())
}

/** The address of a call. */
export const callOf = (name: string): string => `/_t/call/${name}`

/**
 * An answer as two answers are compared whole: its status, its headers without the moment it was sent at, and
 * its body, with what one request alone holds - an id that the attack sent - written as a sign.
 */
export function wholeOf(answer: Wired, own: string[] = []): { status: number; headers: object; text: string } {
  const { date: _, ...headers } = answer.headers
  let text = answer.text
  for (const one of own) text = text.replaceAll(one, '<own>')
  return { status: answer.status, headers, text }
}

/** A connection to the engine of a siege that an attack writes by hand: what arrived, and when the engine closed it. */
export interface ByWire {
  socket: Socket
  write(text: string): void
  // Answers what arrived once the connection is closed, and after how many milliseconds: nothing where it stood open that long.
  closed(withinMs: number): Promise<{ text: string; ms: number } | undefined>
  // What arrived so far.
  arrived(): string
  end(): void
}

/** Opens a connection to the engine of a siege, which is ended with the test. */
export function byWire(t: TestContext, siege: Pick<Siege, 'port'>, via = '127.0.0.1'): Promise<ByWire> {
  return new Promise((done, failed) => {
    const began = performance.now()
    const socket = connect({ host: via, port: siege.port })
    closing(t, () => socket.destroy())
    let text = ''
    let over: number | undefined
    socket.setEncoding('utf8')
    socket.on('data', (part: string) => {
      text += part
    })
    socket.on('close', () => {
      over = performance.now() - began
    })
    socket.once('error', failed)
    socket.once('connect', () => {
      socket.off('error', failed)
      socket.on('error', () => undefined)
      done({
        socket,
        write: (part) => void (socket.destroyed || socket.write(part)),
        async closed(withinMs) {
          const until = performance.now() + withinMs
          while (over === undefined && performance.now() < until) await new Promise((next) => setTimeout(next, 20))
          return over === undefined ? undefined : { text, ms: over }
        },
        arrived: () => text,
        end: () => socket.destroy(),
      })
    })
  })
}

/** Answers the rows of one table of the log of a data folder, in the order they were written. */
export function logOf(dataFolder: string, table: string): Record<string, unknown>[] {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } finally {
    log.close()
  }
}

/** Everything that the log of a data folder holds, as one text: what an attack searches for a value that must be in no log. */
export const wholeLog = (dataFolder: string): string =>
  JSON.stringify(['calls', 'errors', 'slow', 'denied', 'lines'].map((table) => logOf(dataFolder, table)))

/** Answers the code of what a promise is refused with, or nothing where it is kept. */
export async function refusedWith(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : `no code: ${error}`
  }
  return undefined
}

/** The id of the row that a change answered. */
export const rowId = (row: unknown): string => String(Reflect.get(Object(row), 'id'))
