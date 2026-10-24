import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** One answer of the door, read as JSON. */
export interface Wire {
  ok: boolean
  value?: unknown
  error?: { code: string; message?: string; fields?: Record<string, string> }
  caller?: string
}

/** What a request of a browser told: its status, the wire form, and the cookie lines that the answer set. */
export interface Told {
  status: number
  wire: Wire
  set: string[]
}

/** How an attack sends a call: the cookies, the user its page names, where it is sent, and where it says it comes from. */
export interface Calling {
  cookie?: string
  as?: string
  // The scheme and the name that the app is reached by.
  origin?: string
  // The site that the request says it comes from, in `Origin`: the app's own where none is given.
  site?: string
  from?: string
  // Sent to `/_t/read/`, as a page asks a query again.
  read?: true
  headers?: Record<string, string>
}

/** Calls a function of the app as a browser would, with the cookies it is handed, and reads what came back. */
export async function calledByBrowser(app: TestApp, name: string, input: object, o: Calling = {}): Promise<Told> {
  const origin = o.origin ?? 'http://localhost'
  const answer = await app.request(
    new Request(`${origin}/_t/${o.read ? 'read' : 'call'}/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: o.site ?? origin,
        ...(o.cookie ? { cookie: o.cookie } : {}),
        ...o.headers,
      },
      body: JSON.stringify({ input, ...(o.as === undefined ? {} : { as: o.as }) }),
    }),
    o.from === undefined ? undefined : { from: o.from },
  )
  return { status: answer.status, wire: Object(await answer.json()), set: answer.headers.getSetCookie() }
}

/** The `name=value` of the first cookie line of an answer, as a browser sends it back. */
export const kept = (told: Told): string => (told.set[0] ?? '').split(';')[0]

/** The code that an answer failed with, or `ok`. */
export const wireCodeOf = (wire: Wire): string => (wire.ok ? 'ok' : String(wire.error?.code))

/** The id of the user of the starter data that has an email. */
export async function idByEmail(app: TestApp, email: string): Promise<string> {
  const row = (await app.rows('users')).find((one) => one.email === email)
  return String(row?.id)
}

/** Signs a user in, and answers the cookie of the session as a browser sends it back. */
export async function signedInByEmail(app: TestApp, email: string, o: Calling = {}): Promise<string> {
  const told = await calledByBrowser(app, 'signIn', { email }, o)
  assert.equal(told.wire.ok, true, JSON.stringify(told.wire))
  return kept(told)
}

/** Who the door says a request with that cookie is, as the page of that user asks. */
export async function who(app: TestApp, cookie: string | undefined, as?: string): Promise<unknown> {
  const told = await calledByBrowser(app, 'whoAmI', {}, { ...(cookie ? { cookie } : {}), ...(as ? { as } : {}) })
  // Told that its caller changed, the page asks for its screen again, which is drawn for nobody, and asks anew.
  if (told.wire.caller === 'changed') {
    const again = await calledByBrowser(app, 'whoAmI', {}, cookie ? { cookie } : {})
    return again.wire.ok ? again.wire.value : 'changed'
  }
  return told.wire.ok ? told.wire.value : told.wire.error?.code
}

/**
 * Opens a project of the tests as a test app whose folders lie in a folder of the test, and answers it with the
 * data folder of its writer: an attack reads a copy of the data and of the log there. `change` changes the text
 * of a file of the copy first.
 */
export async function stormed(
  t: TestContext,
  project: string,
  o: { secrets?: Record<string, string>; change?: [file: string, from: string, to: string][] } = {},
): Promise<{ app: TestApp; dataFolder: string }> {
  const temp = tempOf(t)
  const folder = copyOf(t, project)
  for (const [file, from, to] of o.change ?? []) {
    const written = readFileSync(join(folder, file), 'utf8')
    assert.ok(written.includes(from), `${file} holds ${from}`)
    writeFileSync(join(folder, file), written.replace(from, to))
  }
  const app = await testApp({ folder, ...(o.secrets ? { secrets: o.secrets } : {}) })
  closing(t, () => app.close())
  assert.equal(tmpdir(), temp)
  const [home] = readdirSync(temp).filter((name) => name.startsWith('tent-test-'))
  return { app, dataFolder: join(temp, home, 'data') }
}

/** Every byte that a folder holds, file by file, with the name of each file. */
export function bytesUnder(folder: string): { file: string; bytes: Buffer }[] {
  const found: { file: string; bytes: Buffer }[] = []
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) found.push(...bytesUnder(path))
    else found.push({ file: path, bytes: readFileSync(path) })
  }
  return found
}

/** The files of a folder that hold a text, written as it is. */
export const holding = (folder: string, text: string): string[] =>
  bytesUnder(folder)
    .filter((one) => one.bytes.includes(Buffer.from(text)))
    .map((one) => one.file)

/** What crosses to the other end of a live connection crosses in a turn of its own. */
export const turn = (ms = 5): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A page that holds a live connection: what it heard, and whether it was closed. */
export interface Watching {
  heard: Record<string, unknown>[]
  closed(): boolean
  send(message: object): void
}

/** Opens the live connection of a page, which answers each sign of life as a page that is there does. */
export function watching(
  app: TestApp,
  o: { cookie?: string; as?: string; headers?: Record<string, string> },
): Watching {
  const origin = 'http://localhost'
  const heard: Record<string, unknown>[] = []
  let closed = false
  const live = app.live(
    new Request(`${origin}/_t/live${o.as === undefined ? '' : `?as=${o.as}`}`, {
      headers: { origin, ...(o.cookie ? { cookie: o.cookie } : {}), ...o.headers },
    }),
  )
  live.each(
    (message) => {
      if (message.t === 'alive') live.send({ t: 'alive' })
      else heard.push(message)
    },
    () => {
      closed = true
    },
  )
  return { heard, closed: () => closed, send: (message) => live.send(message) }
}

/** Waits until something holds, and fails with its name where it does not within two seconds. */
export async function untilTurned(what: string, holds: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !holds(); i++) await turn()
  assert.equal(holds(), true, what)
}
