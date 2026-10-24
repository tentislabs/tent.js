import { kindRead, readBy } from '../read.ts'
import { isRequired } from '../../core/internal.ts'
import type { CallState } from '../handed.ts'
import type { PageStore } from './store.ts'
import type { Answered, ViewRecord } from './types.ts'
import { valueOf } from './valueOf.ts'
import { isStored } from '../../core/internal.ts'

/** One entry of `data` with its input worked out: what it reads, and how it is asked. */
interface Entry {
  name: string
  what: string
  input: Record<string, unknown>
  needed: boolean
  wait: boolean
  // Whether every value that its input needs is there: an entry that lacks one is not asked.
  asked: boolean
  // How often it is asked again while its screen is shown, in milliseconds.
  every?: number
  // It reads a query that is live.
  live?: true
  // What it reads, `'query'` or `'action'`, where that is known.
  kind?: string
}

/** The lengths of time that `refresh` is written in, each in milliseconds. */
const units: Record<string, number> = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 }

/** A length of time in milliseconds: as the description stores it, or as it was written, `'10 minutes'`. */
function everyOf(stated: unknown): number | undefined {
  if (typeof stated === 'number') return stated > 0 ? stated : undefined
  const read = typeof stated === 'string' ? /^(\d+(?:\.\d+)?) ([a-z]+?)s?$/.exec(stated.trim()) : null
  return read && Object.hasOwn(units, read[2]) ? Number(read[1]) * units[read[2]] : undefined
}

/**
 * Takes the record of a screen or of a component, what its `data` is written over, and the page. Answers its
 * entries, each with its input worked out: a stored `data` from its stored values, and one that is code by calling
 * it.
 */
function entriesOf(record: ViewRecord, over: Record<string, unknown>, store: PageStore): Entry[] {
  const written = typeof record.data === 'function' ? record.data(over) : record.data
  if (!isStored(written)) return []
  return Object.entries(written).flatMap(([name, one]): Entry[] => {
    if (!isStored(one)) return []
    // An entry as the description stores it names a query or an action, and one that `read` made names what it reads.
    const stored = typeof one.query === 'string' ? one.query : typeof one.action === 'string' ? one.action : undefined
    const what = stored ?? (typeof one.read === 'string' ? one.read : undefined)
    if (what === undefined) return []
    const given = isStored(one.input) ? one.input : {}
    const input =
      stored === undefined
        ? { ...given }
        : Object.fromEntries(Object.entries(given).map(([key, value]) => [key, valueOf(value, { names: over })]))
    const types = store.stub(what)?.input ?? {}
    const asked = Object.entries(types).every(
      ([field, type]) => !isRequired(type) || (input[field] !== undefined && input[field] !== null),
    )
    const every = everyOf(one.refresh)
    // A query that is live is watched by a living page: what is read says so, as its screen holds it.
    const read: unknown = store.stub(what) ?? readBy(one)
    const live = isStored(read) && read.kind === 'query' && read.live === true
    // The stored form names its kind, an entry that `read` made tells it, and a stub of the screen holds it.
    const kind =
      typeof one.query === 'string'
        ? 'query'
        : typeof one.action === 'string'
          ? 'action'
          : (kindRead(one) ?? store.stub(what)?.kind)
    return [
      {
        name,
        what,
        input,
        needed: one.needed === true,
        wait: one.wait !== false,
        asked,
        ...(every === undefined ? {} : { every }),
        ...(live ? { live } : {}),
        ...(kind === undefined ? {} : { kind }),
      },
    ]
  })
}

/**
 * Takes the record of a view, what its `data` is written over, and the page. Asks each entry that can be asked,
 * and answers what the view is handed under the name of each, with what each asking is doing, what each was
 * answered, and whether the view waits: an entry that its page waits for has no answer yet, and none from before.
 */
export function asked(
  record: ViewRecord,
  over: Record<string, unknown>,
  store: PageStore,
): {
  values: Record<string, unknown>
  calls: Record<string, CallState>
  answers: Record<string, Answered | undefined>
  waits: boolean
} {
  let waits = false
  const values: Record<string, unknown> = {}
  const calls: Record<string, CallState> = {}
  const answers: Record<string, Answered | undefined> = {}
  for (const entry of entriesOf(record, over, store)) {
    const answer = entry.asked
      ? store.ask(entry.what, entry.input, {
          entry: entry.name,
          ...(record.kind === 'component' ? { of: record.name } : {}),
          ...(entry.needed ? { needed: true } : {}),
          ...(entry.wait ? {} : { wait: false }),
          ...(entry.every === undefined ? {} : { every: entry.every }),
          ...(entry.live ? { live: true } : {}),
          ...(entry.kind === undefined ? {} : { kind: entry.kind }),
        })
      : undefined
    answers[entry.name] = answer
    // When its input changes an entry is asked again, and its name keeps the old answer until the new one arrives.
    const id = `${record.kind} ${record.name} ${entry.name}`
    const settled = answer !== undefined && answer.later !== true && answer.left === undefined
    if (settled) store.shown.set(id, answer)
    values[entry.name] = entry.asked ? (settled ? answer : store.shown.get(id))?.value : undefined
    // An entry is busy while it is asked and holds no answer yet.
    const busy = entry.asked && (answer === undefined || answer.later === true || answer.left !== undefined)
    calls[entry.name] = { busy, ...(answer?.error ? { error: answer.error } : {}) }
    // A view is not run without an entry that its page waits for: one that says `wait: false` may be nothing.
    if (busy && entry.wait && !store.shown.has(id)) waits = true
  }
  return { values, calls, answers, waits }
}
