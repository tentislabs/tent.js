import type { Caller, Db, User } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Plan } from '../../core/internal.ts'
import { isPlan, isWritten, runBody, valueOf } from '../../core/internal.ts'
import type { FileName, Noted, Touched, Tx, Writing } from '../../data/index.ts'
import { createDb } from '../../data/index.ts'
import type { CallContext, Written } from '../context.ts'
import { within } from '../context.ts'
import { limitOf } from '../limits.ts'
import { refusingDb } from '../fill/refused.ts'
import type { Opened } from '../opened.ts'
import { callIn } from '../rooms/calls.ts'
import type { Called } from '../rooms/room.ts'
import { sealed } from '../values/seal.ts'
import { endsAt } from '../endsAt.ts'
import { hasFullAccess } from '../full.ts'
import { rowHolding } from '../stored/given.ts'
import { leaving } from './output.ts'
import { callerOf } from './rule.ts'
import { byOf } from '../byWhom.ts'
import { gather } from '../counts/gather.ts'
import { said } from '../flows/said.ts'
import { fileRead } from '../ai/runFiles.ts'
import { dbSpan } from '../trace/db.ts'
import { pageFileRead } from '../pages/fileReads.ts'
import { factRead, factWrote } from '../called.ts'

/** The user that code is handed: nothing for the system, for nobody and for a key that was made for no user. */
const userOf = (caller: Caller): User | undefined => (caller.kind === 'system' ? undefined : caller.user)

/** The error of work that passed the time of its call. */
const tookTooLong = (name: string, limit: string): TentError =>
  new TentError('T0008', `${name} worked past the time of its call, \`limits.${limit}\` of the project.`, {
    fix: 'Do less in one call, or raise the limit in `project.limits`.',
  })

/** The name of the limit of time that a kind of function is held to. */
export const timeLimit = {
  query: 'queryTime',
  change: 'changeTime',
  action: 'actionTime',
  rule: 'queryTime',
  // A seed is held to no time, so nothing ever names this limit for one.
  seed: 'actionTime',
} as const

/** Answers what ends the work of a call once its time is up: a body that was read asks it before every statement and every entry. */
const tickOf = (cx: CallContext) => (): void => {
  if (performance.now() > cx.work.ends) throw tookTooLong(cx.work.name, timeLimit[cx.work.kind])
}

/** Answers a value that must be there at once. Throws T0013 for a promise: a query, a change and a rule wait for nothing. */
function atOnce(name: string, value: unknown): unknown {
  if (typeof Reflect.get(Object(value), 'then') !== 'function') return value
  // The promise is left alone from here on, so its own failure must not end the program.
  Promise.resolve(value).catch(() => undefined)
  throw new TentError('T0013', `${name} answered a promise where it must answer at once.`, {
    fix: 'A query, a change and a rule wait for nothing: take `async` away, or make it an action.',
  })
}

/** What data tells in place of writing a log, written into the log of the app. */
function noted(o: Opened, cx: CallContext, told: Noted): void {
  if (told.kind === 'slow')
    o.log.write('slow', { at: o.clock.now(), name: cx.work.name, ms: Math.round(told.ms), rows: told.rows })
  else
    o.log.write('denied', {
      at: o.clock.now(),
      name: `${told.table}.${told.what}`,
      ...callerOf(cx.caller),
      rule: told.rule,
    })
}

// The members of `db` that are full access: each is there only where the code has it.
const fullAccess = ['system', 'sql', 'n']

/** A `db` that is limited to its caller, on which each member that is full access fails with T0013 where it is read. */
function fenced(db: Db, name: string): object {
  const refuse = (member: string) => ({
    get(): never {
      throw new TentError('T0013', `${name} used \`db.${member}\`, which is full access, and states no \`system\`.`, {
        fix: "State `system: 'why'` on the definition, with the reason it needs full access.",
      })
    },
  })
  return Object.create(db, Object.fromEntries(fullAccess.map((member) => [member, refuse(member)])))
}

/** What carries the plan of `rows` and the writes of `set` out. */
type Stated = Pick<Db, 'read' | 'write'>

const isStated = (value: unknown): value is Stated =>
  typeof Reflect.get(Object(value), 'read') === 'function' && typeof Reflect.get(Object(value), 'write') === 'function'

/**
 * Answers what the plan of `rows` and the writes of `set` of a function are carried out through. A function that
 * states `system` is carried out with full access: its plan reads and its writes write what the rules of the
 * tables would keep from its caller, and its `access` alone says who may call it. Any other is limited to its
 * caller. In code full access is `db.system`, and `db` itself stays limited.
 */
function statedDb(made: Db, record: Record<string, unknown>): Stated {
  const full: unknown = typeof record.system === 'string' ? Reflect.get(made, 'system') : undefined
  return isStated(full) ? full : made
}

/**
 * Makes the `db` of one call, in the write that is open for it or over the store, limited to its caller. `rows`
 * is the most rows that one read of it may answer, as a live query is held to.
 */
function dbOf(
  o: Opened,
  cx: CallContext,
  mode: 'read' | 'write' | 'async',
  full: boolean,
  touches?: unknown,
  rows?: number,
): Db {
  const written = cx.written
  // A row that stores a file holds it in the same write, and a wrong id undoes the write.
  const open = cx.writing ?? cx.tx
  const holds =
    open && written
      ? rowHolding(o, open, cx.caller, hasFullAccess(cx), (work) => {
          written.after = [...(written.after ?? []), work]
        })
      : undefined
  // In an app that keeps a file for each tenant, the files that the work of a run reads are noted for its guards.
  const run = o.tenantFiles ? cx.run?.id : undefined
  const noting = cx.noting
  const read = (plan: Plan, answer: unknown, file?: FileName): void => {
    noting?.(plan, answer, file)
    // Under a call of a test, what it read, which a failure of the test shows.
    factRead(String(plan.from), answer)
    if (run && file) fileRead(o, run, file)
    pageFileRead(String(plan.from), file)
  }
  return createDb(cx.writing ?? cx.tx ?? o.files ?? o.store, o.description, cx.caller, mode, o.rules, {
    system: full,
    now: () => o.clock.now(),
    ids: o.ids,
    limits: { time: Math.max(0, cx.work.ends - performance.now()), ...(rows === undefined ? {} : { rows }) },
    noted: (told) => noted(o, cx, told),
    read,
    ...sealed(o),
    ...(mode === 'write' && written
      ? {
          wrote(w) {
            holds?.(w)
            factWrote(w)
            written.rows.push({ table: w.table, id: String(w.row.id), kind: w.kind })
            // A row is counted under the change that wrote it once its write is committed.
            const { name } = cx.work
            written.after = [
              ...(written.after ?? []),
              () => gather(o, name, { rowsWritten: 1 }, { caller: cx.caller, definition: name }),
            ]
            // The table triggers of the flows fire inside the write that wrote the row.
            o.flows?.wrote(cx, w)
          },
          guarded: { users: ['roles'] },
        }
      : {}),
    ...(Array.isArray(touches) ? { touches: touches.map(String) } : {}),
    // Each read and each write is a span of the trace that the call stands in.
    traced: (what, work) => dbSpan(o, what, work),
  })
}

/**
 * Answers what the references of a form written with values stand for: the input, the caller, and what `valueOf`
 * works out.
 */
export const resolveWith = (cx: CallContext, input: Record<string, unknown>) => (stored: object) =>
  valueOf(stored, {
    ref(one) {
      if ('caller' in one) return userOf(cx.caller)?.id
      if (!('input' in one)) return undefined
      let at: unknown = input
      for (const name of String(one.input).split('.'))
        at = isWritten(at) && Object.hasOwn(at, name) ? at[name] : undefined
      return at
    },
    tick: tickOf(cx),
  })

/** What a rule made with `allow` is asked with. */
export interface CarriedAsking {
  access: Record<string, unknown>
  input: Record<string, unknown>
  // The arrow of the rule, where it is code, as the room answered it.
  arrow?: Called
}

/**
 * Takes an app, the context of a call, and a rule made with `allow`. Asks the rule, on the checked input, with a
 * `db` that reads as the caller and answers at once, and answers whether it lets the caller in. The arrow is held
 * to what a query may use, read or run. Throws T0011 where the rule is code and its arrow was not loaded.
 */
export function allows(o: Opened, cx: CallContext, asking: CarriedAsking): boolean {
  const asked: CallContext = { ...cx, work: { ...cx.work, kind: 'rule' } }
  const db = fenced(dbOf(o, asked, 'read', false), cx.work.name)
  const user = userOf(cx.caller)
  const { access, input, arrow } = asking
  return within(asked, () => {
    if (access.test !== undefined) {
      const as = Array.isArray(access.as) ? access.as.map(String) : []
      const names = { [as[0] ?? 'user']: user, [as[1] ?? 'input']: input, [as[2] ?? 'db']: db }
      return Boolean(atOnce(cx.work.name, valueOf(access.test, { names, tick: tickOf(asked) })))
    }
    if (!arrow)
      throw new TentError('T0011', `The rule of ${cx.work.name} is code, and the bundle holds no arrow for it.`)
    return Boolean(atOnce(cx.work.name, callIn(asked, o.room, arrow, [user, input, db], true, true)))
  })
}

/** What the work of one function is carried out with. */
export interface Carried {
  o: Opened
  cx: CallContext
  record: Record<string, unknown>
  input: Record<string, unknown>
  // The arrow of its `run`, where it is code, as the room answered it.
  run?: Called
  // Calls a function as the system, which a function that states `system` is handed.
  call: (fn: unknown, input?: unknown) => unknown
}

/** What `run` is handed, beside its `db`. */
function handedTo({ cx, record, input, call }: Carried): Record<string, unknown> {
  const user = userOf(cx.caller)
  // An action that is a run tells whoever follows it what it says, and so does work that a step calls, into that
  // step; any other call says to nobody.
  const inStep = cx.run?.step ? { run: cx.run.id, step: cx.run.step } : undefined
  const say = cx.say ?? (inStep ? (value: unknown): void => said(cx.app, inStep, value) : (): void => undefined)
  return { input, user, say, ...(typeof record.system === 'string' ? { call } : {}) }
}

/** The error of a function that the description holds as code, and whose arrow the bundle does not hold. */
const noArrow = (name: string): TentError =>
  new TentError('T0011', `${name} is code, and the bundle holds no \`run\` for it.`, {
    fix: 'Build the project again, and run the bundle as the build wrote it.',
  })

/**
 * Carries a query out, at once: its plan through `db.read`, its body through `runBody`, or its `run` through its
 * room as pure, with the clock, the random source and the network swapped for ones that fail. A rule of a table
 * that is code is pure wherever a plan or a body asks it. Answers what the work answered.
 */
export function carryQuery(c: Carried): unknown {
  const { o, cx, record, input, run } = c
  const { name } = cx.work
  const full = hasFullAccess(cx)
  // A query that is live is held to `liveRows` in each of its reads: one that states `live: false` has no bound of rows.
  const made = dbOf(
    o,
    cx,
    'read',
    full,
    undefined,
    record.live === false ? undefined : limitOf(o.description, 'liveRows'),
  )
  const db = full ? made : fenced(made, name)
  const handed = { ...handedTo(c), db, now: cx.work.now }
  const answer = within(cx, () => {
    if (isPlan(record.plan)) return statedDb(made, record).read(record.plan, resolveWith(cx, input))
    if (Array.isArray(record.body)) return atOnce(name, runBody(record.body, handed, { tick: tickOf(cx) }))
    if (!run) throw noArrow(name)
    return atOnce(name, callIn(cx, o.room, run, [handed], true, true))
  })
  // A pass that named a file which is not ready answers nothing, whatever its code did with the error.
  o.tenantFiles?.heldReady()
  return answer
}

/** The rows of a write, each table once with the ids of its rows. */
function touchedBy(rows: { table: string; id: string }[]): { table: string; ids: string[] }[] {
  const tables = new Map<string, string[]>()
  for (const { table, id } of rows) tables.set(table, [...(tables.get(table) ?? []), id])
  return [...tables].map(([table, ids]) => ({ table, ids }))
}

/**
 * Carries a change out, at once and as one write: in the write of the change that called it, or in a write of its
 * own, which is undone whole where anything in it fails, its output among it. Once its write is committed, the
 * store is told to forget each table that a raw SQL write stated, and each row and each change is told to whoever
 * listens. Answers what leaves the engine. Throws T0008 for a change that worked past its time, which undoes it.
 */
export function carryChange(c: Carried): unknown {
  const { o, cx, record, input, run } = c
  const { name } = cx.work
  const inside = (write: Tx | Writing, written: Written): unknown => {
    const mine: CallContext = { ...cx, ...('files' in write ? { writing: write } : { tx: write }), written }
    const full = hasFullAccess(mine)
    const made = dbOf(o, mine, 'write', full, record.touches)
    const db = full ? made : fenced(made, name)
    const handed = { ...handedTo(c), db, now: cx.work.now }
    const value = within(mine, () => {
      if (Array.isArray(record.writes)) {
        const rows: unknown = statedDb(made, record).write(record.writes.filter(isWrite), resolveWith(mine, input))
        // One write answers its row, and a list of writes a list in the same order.
        return record.writes.length === 1 && Array.isArray(rows) ? rows[0] : rows
      }
      if (Array.isArray(record.body)) return atOnce(name, runBody(record.body, handed, { tick: tickOf(mine) }))
      if (!run) throw noArrow(name)
      return atOnce(name, callIn(mine, o.room, run, [handed], true, false))
    })
    if (performance.now() > cx.work.ends) throw tookTooLong(name, 'changeTime')
    // A pass that named a file which is not ready is undone, whatever its code did with the error.
    o.tenantFiles?.heldReady()
    return leaving(o.description, name, record, value)
  }
  const open = cx.writing ?? cx.tx
  if (open && cx.written) {
    const from = cx.written.rows.length
    const answer = inside(open, cx.written)
    cx.written.done.push({ name, caller: cx.caller, touched: touchedBy(cx.written.rows.slice(from)) })
    return answer
  }
  const written: Written = { rows: [], done: [] }
  // A write begins on a machine that writes now, and is undone where that machine stopped writing meanwhile.
  o.machine.writes(name)
  const carried = (write: Tx | Writing): unknown => {
    const answer = inside(write, written)
    o.machine.writes(name)
    return answer
  }
  const files = o.files
  const { value, touched }: { value: unknown; touched: Touched[] } = files
    ? files.write(carried, byOf(cx))
    : o.store.write(carried, byOf(cx))
  // A raw SQL write names its table and no row: what the store keeps in memory of that table is built anew.
  for (const one of touched) if (!one.ids.length) (one.file ? files?.of(one.file) : o.store)?.forget(one.table)
  for (const one of written.after ?? []) one()
  for (const row of written.rows) o.raise('row.changed', { app: o.app, ...row })
  for (const one of written.done) o.raise('change.done', { app: o.app, ...one })
  o.raise('change.done', { app: o.app, name, caller: cx.caller, touched })
  return value
}

/** Whether a stored record is a write: the shape of the description holds it to be one. */
export const isWrite = (stored: unknown): stored is Parameters<Db['write']>[0][number] =>
  isWritten(stored) && typeof (stored.add ?? stored.change ?? stored.remove) === 'string'

/**
 * The `db` of work that may wait, as an action and a route are handed one: it reads and answers promises, limited
 * to the caller, with full access under `db.system` where the definition states `system`.
 */
export function waitingDb(o: Opened, cx: CallContext): object {
  // What fills a column is handed all it may read, and reads nothing of the store.
  if (cx.fills) return refusingDb()
  const full = hasFullAccess(cx)
  const made = dbOf(o, cx, 'async', full)
  const whole = full ? made : fenced(made, cx.work.name)
  // Of an app that keeps a data file for each tenant, a promise of `db` waits for a file that is not ready.
  return o.tenantFiles ? o.tenantFiles.waiting(whole) : whole
}

/**
 * Carries an action out: its body through `runBody`, or its `run`, with a `db` that reads and answers promises.
 * Answers a promise of what the work answered. The promise is refused with T0008 once the time of the call is up,
 * and the signal of the call ends then.
 */
export async function carryAction(c: Carried, ends: AbortController): Promise<unknown> {
  const { o, cx, record, run } = c
  const { name } = cx.work
  const handed = { ...handedTo(c), db: waitingDb(o, cx), about: cx.about }
  // The end of the work may move while it runs: the wait for a part that is fetched is taken out of its time.
  const { timeUp, cancel } = endsAt(cx.work, () => {
    ends.abort()
    return tookTooLong(name, 'actionTime')
  })
  try {
    const work = within(cx, async () => {
      if (Array.isArray(record.body)) return runBody(record.body, handed, { tick: tickOf(cx) })
      if (!run) throw noArrow(name)
      // An action that states `batch` is handed a list of entries where it runs here too: this call is one of them.
      if (record.batch !== undefined) {
        const answered: unknown = await callIn(cx, o.room, run, [{ entries: [handed] }], false, false)
        if (!Array.isArray(answered) || answered.length !== 1)
          throw new TentError('T0009', 'A batch answered no list of the length it was handed.')
        if (answered[0] instanceof Error) throw answered[0]
        return answered[0]
      }
      return callIn(cx, o.room, run, [handed], false, false)
    })
    return await Promise.race([work, timeUp])
  } finally {
    cancel()
  }
}
