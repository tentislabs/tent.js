import type { Caller, Db } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { runBody } from '../../core/internal.ts'
import type { Tx, Writing } from '../../data/index.ts'
import type { App } from '../app.ts'
import type { CallContext } from '../context.ts'
import { within } from '../context.ts'
import { called } from '../door/call.ts'
import { isWrite } from '../door/carry.ts'
import { roomVersionOf } from '../code.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { dbFor } from '../program.ts'
import { callIn } from '../rooms/calls.ts'
import { entriesOf } from '../rooms/entries.ts'
import type { Called } from '../rooms/room.ts'

const system: Caller = { kind: 'system' }

// The members of a table that write a row.
const writing = ['add', 'change', 'remove']

/**
 * The `db` that the arrow of a seed is handed: it reads and writes with full access and answers at once, and each
 * write of it is a write of its own, which tells nobody.
 */
function seedDb(o: Opened, inOwnWrite: <Answer>(work: (db: Db) => Answer) => Answer): object {
  const reads = dbFor(o, system)
  /** The members that write a row of a table, or of one tenant of it where `of` names one: each a write of its own. */
  const writers = (name: string, of?: unknown[]): PropertyDescriptorMap =>
    Object.fromEntries(
      writing.map((member) => {
        const write = (...values: unknown[]): unknown =>
          inOwnWrite((db) => {
            const table: unknown = Reflect.get(db, name)
            const at: unknown = of ? Reflect.apply(Object(Reflect.get(Object(table), 'of')), table, of) : table
            return Reflect.apply(Object(Reflect.get(Object(at), member)), at, values)
          })
        return [member, { value: write, enumerable: true }]
      }),
    )
  const tables = Object.keys(o.description.tables).map((name) => {
    const read: object = Object(Reflect.get(reads, name))
    // A tenant table is written through `of`, which names the tenant: its writes are own writes too.
    const of = (...named: unknown[]): object =>
      Object.create(Object(Reflect.apply(Object(Reflect.get(read, 'of')), read, named)), writers(name, named))
    const members = { ...writers(name), of: { value: of, enumerable: true } }
    return [name, { value: Object.create(read, members), enumerable: true }] as const
  })
  const db: object = Object.create(reads, Object.fromEntries(tables))
  return Object.defineProperty(db, 'system', { value: db })
}

/**
 * `app.seed`: applies the seed of the running version, as the system. A list of writes is carried out write by
 * write. An arrow, read or run, is handed `db`, `call`, which calls a function as the system, and `now`, the
 * moment the seed is applied, and may wait. An app with no seed has nothing to apply.
 */
export const member =
  (o: Opened): App['seed'] =>
  async () => {
    heldOpen(o)
    // On a reader the seed is the writer's to apply, as every write is.
    await o.machine.sent('seed', [], system, false, () => saidWhereFailed(o))
  }

/**
 * Applies the seed, and ends with its failure where it fails, at once or after a wait: a failure of ours as it
 * is, and what the code of the seed itself threw as T0009, which holds it as its cause. The log holds it too.
 */
async function saidWhereFailed(o: Opened): Promise<void> {
  try {
    await applied(o)
  } catch (error) {
    let failed: TentError
    if (error instanceof TentError) failed = error
    else {
      const words = error instanceof Error ? error.message : String(error)
      failed = new TentError('T0009', `The seed failed: ${words}`, {
        fix: 'Mend the seed of the project. Each write that it made before it failed stands.',
      })
      failed.cause = error
    }
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'error',
      message: 'The seed of the app failed.',
      data: JSON.stringify({ code: failed.code, error: failed.message }),
    })
    throw failed
  }
}

/** Applies the seed of the running version of an app, on the machine that writes. */
async function applied(o: Opened): Promise<void> {
  const seed = o.description.seed
  if (!seed) return
  const inOwnWrite = <Answer>(work: (db: Db) => Answer): Answer => {
    o.machine.writes('app.seed')
    const carried = (write: Tx | Writing): Answer => work(dbFor(o, system, write))
    return (o.files ? o.files.write(carried) : o.store.write(carried)).value
  }
  if (Array.isArray(seed.writes)) {
    for (const write of seed.writes.filter(isWrite)) inOwnWrite((db) => db.write([write]))
    return
  }
  const now = new Date(o.clock.now())
  const cx: CallContext = {
    app: o,
    version: o.version,
    caller: system,
    made: 0,
    signal: new AbortController().signal,
    // A seed is held to no time: it is what the app starts from, and whoever applies it waits for it.
    work: { name: 'seed', kind: 'seed', depth: 0, now, ends: Number.POSITIVE_INFINITY },
  }
  const call = (fn: unknown, input?: unknown): unknown =>
    called(o, String(Reflect.get(Object(fn), 'definition')), input, { caller: system, parent: cx })
  const handed = { db: seedDb(o, inOwnWrite), call, now }
  if (Array.isArray(seed.body)) {
    const body: object[] = seed.body
    await within(cx, () => runBody(body, handed))
    return
  }
  const kept = entriesOf(o.description).entries.find((one) => one.keep === 'seed')
  if (!kept)
    throw new TentError('T0011', 'The seed of the bundle is code, and the bundle holds no arrow for it.', {
      fix: 'Build the project again, and run the bundle as the build wrote it.',
    })
  // The seed is loaded by the app's room when it is first applied, beside the version's other code.
  await o.room.load(roomVersionOf(o, [{ path: kept.entry.module, kinds: ['seed'] }]))
  let arrow: Called
  try {
    arrow = o.room.entry(o.version, kept.entry)
  } catch (error) {
    const failed = new TentError('T0011', 'The seed of the bundle is code, and the bundle holds no arrow for it.', {
      fix: 'Build the project again, and run the bundle as the build wrote it.',
    })
    failed.cause = error
    throw failed
  }
  await within(cx, () => callIn(cx, o.room, arrow, [handed], false, false))
}
