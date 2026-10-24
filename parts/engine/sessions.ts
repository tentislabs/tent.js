import { randomBytes } from 'node:crypto'
import type { Caller } from '../core/index.ts'
import { later, TentError } from '../core/index.ts'
import type { Row, Store, StorePlan, Tx } from '../data/index.ts'
import type { CallContext } from './context.ts'
import { cookieLine, cookieName, cookieOf } from './cookies.ts'
import { hasFullAccess } from './full.ts'
import { storedLimit } from './limits.ts'
import type { Opened } from './opened.ts'
import { callerWritten } from './program.ts'
import { table } from './tables/sessions.ts'
import { momentOf } from './moment.ts'
import type { Visit } from './visit.ts'
import { browserVisit, visit } from './visit.ts'
import type { About } from './web/proxy.ts'
import { fingerprintOf } from '../core/internal.ts'

const system = { kind: 'system' } as const

const day = 86_400_000

/** One session as its row holds it. */
interface Held {
  fingerprint: string
  user: string
  createdAt: number
  usedAt: number
  expiresAt: number
  // Its own life in milliseconds, where it was started with another than `sessionTime`.
  life?: number
  browserOnly: boolean
}

/** A moment of a row in milliseconds: one that holds none is long past. */
const ms = (value: unknown): number => momentOf(value) ?? 0

const heldOf = (row: Row): Held => ({
  fingerprint: String(row.fingerprint),
  user: String(row.user),
  createdAt: ms(row.createdAt),
  usedAt: ms(row.usedAt),
  expiresAt: ms(row.expiresAt),
  ...(typeof row.life === 'number' ? { life: row.life } : {}),
  browserOnly: row.browserOnly === 1,
})

/** What reads the rows of the sessions: the store of the app, or the write that is open. */
type Reads = (plan: StorePlan) => unknown

const inStore =
  (store: Store): Reads =>
  (plan) =>
    store.read(plan, system).value

const inTx =
  (tx: Tx): Reads =>
  (plan) =>
    tx.read(plan, system)

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

function sessionAt(read: Reads, fingerprint: string): Held | undefined {
  const row = read({ from: table.name, one: 'get', id: fingerprint })
  return isRow(row) ? heldOf(row) : undefined
}

/** The sessions that stand: those of one user, or every one. */
function sessionsIn(read: Reads, user?: string): Held[] {
  const rows = read({ from: table.name, ...(user === undefined ? {} : { where: { col: 'user', is: user } }) })
  return (Array.isArray(rows) ? rows : []).filter(isRow).map(heldOf)
}

/**
 * The fingerprint that the data keeps of a session: of the 32 bytes that its cookie holds, and never the bytes
 * themselves, so that a copy of the data signs nobody in. Nothing for a text that no session cookie holds.
 */
function sessionPrint(token: string | undefined): string | undefined {
  if (token === undefined || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined
  return fingerprintOf(Buffer.from(token, 'base64url'))
}

/** The life of one session: its own, or `limits.sessionTime` of the project. */
const lifeOf = (o: Opened, held: { life?: number }): number => held.life ?? storedLimit(o.description, 'sessionTime')

/** The id by which a builder names a session: the first 16 characters of its fingerprint. */
const shortId = (fingerprint: string): string => fingerprint.slice(0, 16)

/** Closes each live connection that was opened with one of those sessions, which is told that its caller changed. */
function closeLive(o: Opened, fingerprints: string[]): void {
  for (const one of fingerprints) o.hub?.ended(one)
}

/**
 * Step 3 of the door, for a session: takes an app, a request and what the engine knows of it. Answers the user of
 * the session that the cookie of the request names, read from `users` as the row is now, and the fingerprint of
 * that session. A session that was last moved on a day ago, or a tenth of its own life ago where that is shorter,
 * is moved on, and where a request of a browser is being answered its cookie is sent again. Nothing for a request
 * that carries no session cookie, or two, for a session that is not there or whose time is up, and for a user
 * whose row is gone.
 */
export function sessionCaller(
  o: Opened,
  request: Request,
  about: About,
): { caller: Caller; session: string } | undefined {
  const fingerprint = sessionPrint(cookieOf(request, cookieName(o, about, 'session')))
  if (fingerprint === undefined) return undefined
  const held = sessionAt(inStore(o.store), fingerprint)
  const now = o.clock.now()
  if (!held || held.expiresAt <= now) return undefined
  let caller: Caller
  try {
    caller = callerWritten(o, held.user)
  } catch {
    return undefined
  }
  const life = lifeOf(o, held)
  const due = now - held.usedAt >= Math.min(day, life / 10)
  // A reader moves no session on: the writer alone writes. The reader hands a request whose session is due to its
  // writer, which moves it, so that the cookie is sent again with the answer.
  const here = visit()
  if (due && o.machine.reader && here) here.due = true
  if (due && !o.machine.reader) {
    o.store.write((tx) =>
      tx.change(table.name, fingerprint, { usedAt: new Date(now), expiresAt: new Date(now + life) }, system),
    )
    if (here && !held.browserOnly)
      here.cookies.push(cookieLine(o, about, 'session', cookieOf(request, cookieName(o, about, 'session')) ?? '', life))
  }
  return { caller, session: fingerprint }
}

/** The error of a member of `sessions` that is used where no request of a browser is being answered. */
const noBrowser = (member: string): TentError =>
  new TentError('T0013', `\`sessions.${member}\` was used where no request of a browser is being answered.`, {
    fix: 'Start and end a session in a change, an action or a route that a browser called through the door. A test reaches it with `app.browser()`.',
  })

/** The write that a call works in, or a write of its own where it has none open. */
function inWrite(o: Opened, cx: CallContext, work: (tx: Tx) => void, after: () => void): void {
  const open = cx.writing ? cx.writing.tx() : cx.tx
  if (open && cx.written) {
    work(open)
    // In a change the session is part of the write: what follows it waits for the write to be committed.
    cx.written.after = [...(cx.written.after ?? []), after]
    return
  }
  o.store.write(work)
  after()
}

// The sessions that a writer made for a browser that a program drives: they count on no bound of the user's own
// sessions, and end when that browser closes.
const drivenOf = new WeakMap<Opened, Set<string>>()

/**
 * Writes the row of a new session of a user into a write, and ends the sessions of that user past
 * `limits.sessionsPerUser`, those used longest ago first. A session of a browser that a program drives is counted on
 * no bound and ends none. Answers the fingerprints of the sessions it ended.
 */
function sessionAdded(
  o: Opened,
  tx: Tx,
  made: { fingerprint: string; user: string; life: number; own?: number; browserOnly: boolean; driven?: boolean },
): string[] {
  const now = o.clock.now()
  tx.add(
    table.name,
    {
      fingerprint: made.fingerprint,
      user: made.user,
      createdAt: new Date(now),
      usedAt: new Date(now),
      expiresAt: new Date(now + made.life),
      ...(made.own === undefined ? {} : { life: made.own }),
      browserOnly: made.browserOnly ? 1 : 0,
    },
    system,
  )
  if (made.driven) return []
  const most = storedLimit(o.description, 'sessionsPerUser')
  const programs = drivenOf.get(o)
  const all = sessionsIn(inTx(tx), made.user)
    .filter((one) => !programs?.has(one.fingerprint))
    .sort((a, b) => a.usedAt - b.usedAt || a.createdAt - b.createdAt)
  const dropped: string[] = []
  for (const old of all.slice(0, Math.max(0, all.length - most))) {
    if (old.fingerprint === made.fingerprint) continue
    tx.remove(table.name, old.fingerprint, system)
    dropped.push(old.fingerprint)
  }
  return dropped
}

/** The id of a user as a program names one: the id itself, a caller that is a user, or the row. */
function userIdOf(user: unknown): string | undefined {
  if (typeof user === 'string') return user === 'system' || user === 'nobody' ? undefined : user
  const named: unknown = Reflect.get(Object(user), 'kind')
  const id: unknown =
    named === undefined ? Reflect.get(Object(user), 'id') : Reflect.get(Object(Reflect.get(Object(user), 'user')), 'id')
  return (named === undefined || named === 'user') && typeof id === 'string' ? id : undefined
}

// A browser of this computer reaches an app in development and test over plain http: its cookie has the bare name.
const thisComputer: About = {
  from: '127.0.0.1',
  scheme: 'http',
  host: 'localhost',
  origin: 'http://localhost',
  proxied: false,
}

/**
 * Takes a writer, a user, the fingerprint of a new session, and whether it is for a browser that a program drives.
 * Writes that session for the user, as `sessions.start` does. Throws T0030 on a machine that does not write, T0014
 * with no `users` table, and T2103 for an id that names no row.
 */
function sessionWritten(o: Opened, user: string, fingerprint: string, driven: boolean): void {
  o.machine.writes('`app.session`')
  callerWritten(o, user)
  const life = storedLimit(o.description, 'sessionTime')
  let dropped: string[] = []
  o.store.write((tx) => {
    dropped = sessionAdded(o, tx, { fingerprint, user, life, browserOnly: false, driven })
  })
  if (driven) {
    const held = drivenOf.get(o) ?? new Set<string>()
    drivenOf.set(o, held.add(fingerprint))
  }
  closeLive(o, dropped)
  o.raise('session.started', { app: o.app, user })
}

/** Ends a session of a browser that a program drives, on the writer that made it: any other is left as it is. */
function drivenEndedHere(o: Opened, fingerprint: string): void {
  if (!drivenOf.get(o)?.delete(fingerprint) || !sessionAt(inStore(o.store), fingerprint)) return
  o.store.write((tx) => tx.remove(table.name, fingerprint, system))
  closeLive(o, [fingerprint])
}

/** Sends a session of a reader on to its writer. The link is loaded on a reader alone, as every use of it is reached. */
async function sentHere(o: Opened, told: Record<string, unknown>): Promise<unknown> {
  const { sentOn } = await import('./copy/sentOn.ts')
  return sentOn(o, 'session', [told], system)
}

// The sessions that a reader had its writer make and does not hold yet: a request that carries one waits for it.
const makingOf = new WeakMap<Opened, Map<string, Promise<void>>>()

/**
 * `app.session`: takes an app, a user, by the id of its row, as a caller that is a user, or as the row, and whether
 * the session is for a browser that a program drives. Makes a session for that user as `sessions.start` does, with
 * no request and no address of the app, and answers the line of its cookie as a browser of this computer sends it
 * back: `tent_session.<the app's name>=<the token>`. A reader has its writer write the session, as it hands on a
 * write, and a request that carries the cookie there waits until the reader holds it. Throws T0013 outside the
 * modes `development` and `test`, T0030 on a writer that no longer writes, T0014 with no `users` table, and T2103
 * where it names no user, or an id that names no row.
 */
export function madeSession(o: Opened, user: unknown, driven = false): string {
  if (o.mode !== 'development' && o.mode !== 'test')
    throw new TentError('T0013', 'A program makes a session for a user in the modes development and test alone.', {
      fix: 'On live data a user signs in through the sign-in of the app, which calls `sessions.start`.',
    })
  const id = userIdOf(user)
  if (id === undefined)
    throw new TentError('T2103', 'A session is for a user of the app, and none was named.', {
      fix: 'Name the id of a row of `users`.',
    })
  const token = randomBytes(32).toString('base64url')
  const fingerprint = sessionPrint(token) ?? ''
  const reader = o.machine.reader
  if (!reader) sessionWritten(o, id, fingerprint, driven)
  else {
    callerWritten(o, id)
    const making = makingOf.get(o) ?? new Map<string, Promise<void>>()
    makingOf.set(o, making)
    // The writer is handed the fingerprint alone: the token never leaves the program that holds the cookie.
    const made = sentHere(o, { user: id, fingerprint, driven })
      .then((told) =>
        reader.untilApplied(Number(Reflect.get(Object(told), 'n')), storedLimit(o.description, 'catchUp')),
      )
      .then(() => undefined)
      .finally(() => making.delete(fingerprint))
    // What the writer failed with is thrown to a request that waits for the session, where one does.
    made.catch(() => undefined)
    making.set(fingerprint, made)
  }
  return `${cookieName(o, thisComputer, 'session')}=${token}`
}

/**
 * Takes an app and the line of the cookie of a session that `madeSession` made for a browser that a program drives.
 * Ends that session, once its browser has closed; a reader has its writer end it. A session that a person started
 * is never ended this way.
 */
export async function drivenEnded(o: Opened, line: string): Promise<void> {
  // An app that closed ended the sessions of its browsers as it closed.
  if (o.closed) return
  const fingerprint = sessionPrint(line.slice(line.indexOf('=') + 1)) ?? ''
  if (!o.machine.reader) return drivenEndedHere(o, fingerprint)
  // A writer that is not reached leaves the session to its time: it counts on no bound, and its browser is gone.
  await sentHere(o, { ends: fingerprint }).catch(() => undefined)
}

/**
 * What a writer does with `app.session` that a reader sent on: `{ user, fingerprint, driven }` writes that session,
 * and `{ ends }` ends a session of a browser that a program drives. Throws T0002 for anything else.
 */
export function sessionHanded(o: Opened, told: unknown): void {
  const asked: Record<string, unknown> = Object(told)
  const { user, fingerprint, ends } = asked
  if (typeof ends === 'string') drivenEndedHere(o, ends)
  else if (typeof user === 'string' && typeof fingerprint === 'string' && /^[0-9a-f]{64}$/.test(fingerprint))
    sessionWritten(o, user, fingerprint, asked.driven === true)
  else
    throw new TentError('T0002', 'A session that a reader sends on is { "user", "fingerprint" } or { "ends" }.', {
      fields: { args: 'type' },
    })
}

/**
 * Takes a reader, a request and what the engine knows of it. Answers what the request waits for where its cookie
 * names a session that the reader had its writer make and does not hold yet, and nothing otherwise.
 */
export function sessionMaking(o: Opened, request: Request, about: About): Promise<void> | undefined {
  const fingerprint = sessionPrint(cookieOf(request, cookieName(o, about, 'session')))
  return fingerprint === undefined ? undefined : makingOf.get(o)?.get(fingerprint)
}

/** Ends each session of a browser that a program drives that still stands when its writer closes: its program let go of it. */
export function drivenClosed(o: Opened): void {
  const held = drivenOf.get(o)
  if (!held?.size) return
  try {
    o.machine.writes('the end of a session')
  } catch {
    // A machine that no longer writes leaves them to their time: they count on no bound, and their browsers are gone.
    return
  }
  for (const one of [...held]) drivenEndedHere(o, one)
}

/**
 * `sessions.start`: takes the context of a call, the id of a user or the row, and how the session is started.
 * Makes a new session for the browser whose request is being answered, and ends the one the request came with. A
 * user who holds `limits.sessionsPerUser` loses the one that was used longest ago.
 * Throws T0013 where no browser is being answered, T0014 with no `users` table, T2103 for an id that names no
 * row, and T0027 for a life that does not read.
 */
export function startSession(cx: CallContext, user: unknown, how: unknown): void {
  const o = cx.app
  const here = browserVisit()
  if (!here) throw noBrowser('start')
  const id = typeof user === 'string' ? user : String(Reflect.get(Object(user), 'id'))
  callerWritten(o, id)
  const stated: unknown = Reflect.get(Object(how), 'for')
  const own = stated === undefined ? undefined : later(new Date(0), String(stated)).getTime()
  if (own !== undefined && !(own > 0))
    throw new TentError('T0027', `A session lives for a length of time, and ${JSON.stringify(stated)} is none.`, {
      fix: "Hand `for` a length of time, as `'30 minutes'`.",
    })
  const browserOnly = Reflect.get(Object(how), 'browserOnly') === true
  const token = randomBytes(32).toString('base64url')
  const fingerprint = sessionPrint(token) ?? ''
  const before = here.session
  const dropped: string[] = before ? [before] : []
  const life = own ?? storedLimit(o.description, 'sessionTime')
  inWrite(
    o,
    cx,
    (tx) => {
      if (before && sessionAt(inTx(tx), before)) tx.remove(table.name, before, system)
      dropped.push(...sessionAdded(o, tx, { fingerprint, user: id, life, own, browserOnly }))
    },
    () => {
      here.cookies.push(cookieLine(o, here.about, 'session', token, browserOnly ? undefined : life))
      here.session = fingerprint
      here.changed = true
      closeLive(o, dropped)
      o.raise('session.started', { app: o.app, user: id })
    },
  )
}

/** The user that a call may name without full access: its own caller, where that is a user. */
const ownUser = (cx: CallContext): string | undefined => (cx.caller.kind === 'user' ? cx.caller.user?.id : undefined)

/** Takes the cookie of the session of a request away, and says that its caller changed. */
function leaves(o: Opened, here: Visit): void {
  here.cookies.push(cookieLine(o, here.about, 'session', '', 0))
  delete here.session
  here.changed = true
}

/**
 * `sessions.end`: ends the session of the request, or the one that `id` names: one of the caller's own, and any
 * user's in code with full access. The cookie of an ended session of the request is taken away. An id that names
 * no session the code may end changes nothing. Throws T0013 where no browser is being answered.
 */
export function endSession(cx: CallContext, id: unknown): void {
  const o = cx.app
  const here = browserVisit()
  if (!here) throw noBrowser('end')
  let ended: string | undefined
  if (id === undefined) ended = here.session
  else {
    const mine = ownUser(cx)
    const read = inStore(o.store)
    const within = hasFullAccess(cx) ? sessionsIn(read) : mine === undefined ? [] : sessionsIn(read, mine)
    ended = within.find((one) => shortId(one.fingerprint) === String(id))?.fingerprint
  }
  const own = ended !== undefined && ended === here.session
  // A sign-out takes the cookie of the browser away also where the session it names is gone.
  if (ended === undefined && id !== undefined) return
  inWrite(
    o,
    cx,
    (tx) => {
      if (ended !== undefined && sessionAt(inTx(tx), ended)) tx.remove(table.name, ended, system)
    },
    () => {
      if (own || id === undefined) leaves(o, here)
      if (ended !== undefined) closeLive(o, [ended])
    },
  )
}

/** Holds a member that names a user to the caller's own, and to any user in code with full access. Throws T0013. */
function heldToUser(cx: CallContext, member: string, user: unknown): string {
  const id = typeof user === 'string' ? user : String(Reflect.get(Object(user), 'id'))
  if (id === ownUser(cx) || hasFullAccess(cx)) return id
  throw new TentError(
    'T0013',
    `${cx.work.name} used \`sessions.${member}\` for another user than its caller, which is full access.`,
    { fix: "Name the user of the call, or state `system: 'why'` on the definition." },
  )
}

/**
 * `sessions.endAll`: ends every session of a user, the one of the request among them, whose cookie is then taken
 * away. Throws T0013 for another user than the caller, in code that has no full access.
 */
export function endSessions(cx: CallContext, user: unknown): void {
  const o = cx.app
  const id = heldToUser(cx, 'endAll', user)
  const here = visit()
  const ended: string[] = []
  inWrite(
    o,
    cx,
    (tx) => {
      for (const one of sessionsIn(inTx(tx), id)) {
        tx.remove(table.name, one.fingerprint, system)
        ended.push(one.fingerprint)
      }
    },
    () => {
      if (here?.session !== undefined && ended.includes(here.session) && !here.answered) leaves(o, here)
      closeLive(o, ended)
    },
  )
}

/**
 * `sessions.list`: the sessions of a user that stand, the oldest first, each as `{ id, createdAt, usedAt,
 * current }`, where `current` marks the session of the request. Throws T0013 for another user than the caller, in
 * code that has no full access.
 */
export function listSessions(
  cx: CallContext,
  user: unknown,
): { id: string; createdAt: Date; usedAt: Date; current: boolean }[] {
  const id = heldToUser(cx, 'list', user)
  const open = cx.writing ? cx.writing.tx() : cx.tx
  const now = cx.app.clock.now()
  const current = visit()?.session
  return sessionsIn(open ? inTx(open) : inStore(cx.app.store), id)
    .filter((one) => one.expiresAt > now)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((one) => ({
      id: shortId(one.fingerprint),
      createdAt: new Date(one.createdAt),
      usedAt: new Date(one.usedAt),
      current: one.fingerprint === current,
    }))
}

/** Removes every session whose time is up. A reader removes none: its writer does. */
export function sweepSessions(o: Opened): void {
  if (o.machine.reader) return
  const now = o.clock.now()
  const over = sessionsIn(inStore(o.store)).filter((one) => one.expiresAt <= now)
  if (!over.length) return
  o.store.write((tx) => {
    for (const one of over) tx.remove(table.name, one.fingerprint, system)
  })
  closeLive(
    o,
    over.map((one) => one.fingerprint),
  )
}
