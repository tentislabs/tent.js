import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { App, OpenOptions } from '../index.ts'
import type { Bundling, Running } from './apps.ts'
import { logRows, running, system, testClock } from './apps.ts'

/** One message of the live connection, as it was read from JSON. */
export type Message = Record<string, unknown>

export const liveMoment = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Waits until something holds, and fails where it never does. It waits for what it reads, and for no length of time. */
export async function untilTried(what: string, holds: () => boolean, tries = 1500): Promise<void> {
  for (let i = 0; i < tries && !holds(); i++) await liveMoment()
  assert.equal(holds(), true, `never: ${what}`)
}

/** The end of a live connection that a test holds, as a page would: what it was sent so far, and whether it was closed. */
export interface Watcher {
  got: Message[]
  closed(): boolean
  send(message: object): void
  close(): void
  // The messages of one name that it was sent so far, and of one watch where an id is named.
  of(t: string, id?: string): Message[]
  // Sends a watch, and answers the first message that names it.
  watch(id: string, query: string, input?: unknown, more?: Message): Promise<Message>
}

/** What a test says of the opening of a live connection: `site` is the `Origin` it carries, and none where it is null. */
export interface Opening {
  cookie?: string
  as?: string
  site?: string | null
  // The test answers the signs of life itself, and is handed each. Left out, each sign is answered as a page answers it.
  signs?: true
}

/** The request that opens `/_t/live` of an app, as a page of that origin sends it. */
export function opening(origin: string, o: Opening = {}): Request {
  const site = o.site === undefined ? origin : o.site
  return new Request(`${origin}/_t/live${o.as === undefined ? '' : `?as=${encodeURIComponent(o.as)}`}`, {
    headers: { ...(site === null ? {} : { origin: site }), ...(o.cookie === undefined ? {} : { cookie: o.cookie }) },
  })
}

/** Opens a live connection of an app with no network, and answers the end that a page would hold. */
export function watcher(app: App, origin: string, o: Opening = {}): Watcher {
  const end = app.live(opening(origin, o))
  const got: Message[] = []
  let closed = false
  end.each(
    (message) => {
      // A test that takes its time is no page that went silent.
      if (message.t === 'alive' && !o.signs) end.send({ t: 'alive' })
      else got.push(message)
    },
    () => {
      closed = true
    },
  )
  const of = (t: string, id?: string): Message[] =>
    got.filter((one) => one.t === t && (id === undefined || one.id === id))
  return {
    got,
    closed: () => closed,
    send: (message) => end.send(message),
    close: () => end.close(),
    of,
    async watch(id, query, input = {}, more = {}) {
      const before = got.filter((one) => one.id === id).length
      end.send({ t: 'watch', id, query, input, ...more })
      await untilTried(
        `the watch ${id} of ${query} was answered`,
        () => got.filter((one) => one.id === id).length > before,
      )
      return got.filter((one) => one.id === id)[before]
    },
  }
}

/** How often a function was carried out so far, by the rows of the log. */
export const runsOf = (dataFolder: string, name: string): number =>
  logRows(dataFolder, 'calls').filter((row) => row.name === name).length

/** The limits that a test gives the project of the board, as they are stored. */
export const limited =
  (limits: Record<string, number>, more?: (description: Description) => void) =>
  (description: Description): void => {
    Object.assign(description.project, { limits: { ...Object(description.project.limits), ...limits } })
    more?.(description)
  }

/** An app of the board in the mode `test`, with a clock that the test moves where it asks for one. */
export async function board(
  t: TestContext,
  o: Bundling & { open?: Partial<OpenOptions>; stands?: true } = {},
): Promise<Running & { advance(ms: number): void }> {
  const { clock, advance } = testClock()
  const { stands, ...rest } = o
  const run = await running(t, {
    project: 'board',
    ...rest,
    ...(stands ? { engine: { makers: { clock: () => clock } } } : {}),
  })
  return { ...run, advance }
}

/** Adds a user to the board, and answers the id of its row. */
export async function addBoardUser(app: App, name: string, roles: string[] = []): Promise<string> {
  const row = await app.call('addUser', { name, roles }, { as: system })
  return String(Reflect.get(Object(row), 'id'))
}

/** Makes a session for a user, and answers the cookie that a browser of it then sends. */
export const cookieOf = (app: App, user: string): string => app.session(user)

/** Adds a card as a visitor would, and answers the id of its row. */
export async function addCard(app: App, title: string, rank: number): Promise<string> {
  const row = await app.call('addCard', { title, rank }, { as: system })
  return String(Reflect.get(Object(row), 'id'))
}

/** The ids of the rows of a list, in their order. */
export const idsOf = (rows: unknown): string[] =>
  (Array.isArray(rows) ? rows : []).map((row) => String(Reflect.get(Object(row), 'id')))

/**
 * Takes the list a page holds and a `rows` message. Answers the list as the page holds it after: the rows that left
 * and the rows that are named are taken out, and each named row is put after the row that its `after` names, in the
 * order of the message, one with no `after` first.
 */
export function applied(list: Message[], message: Message): Message[] {
  const put: { row: Message; after?: string }[] = Object(message.put)
  const removed: string[] = Object(message.removed)
  const gone = new Set([...removed, ...put.map((one) => String(one.row.id))])
  const next = list.filter((row) => !gone.has(String(row.id)))
  for (const { row, after } of put) {
    const at = after === undefined ? 0 : next.findIndex((one) => one.id === after) + 1
    assert.ok(after === undefined || at > 0, `the row ${after} that a put names stands in the list`)
    next.splice(at, 0, row)
  }
  return next
}
