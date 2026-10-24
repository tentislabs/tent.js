import { momentOf } from '../moment.ts'
import type { Opened } from '../opened.ts'
import type { FillGroup } from './columns.ts'
import { fillGroups } from './columns.ts'
import { nextFillAt, openDue } from './closedFiles.ts'
import { TentError } from '../../core/index.ts'
import { makeEmbeds } from './embedding.ts'
import { openBehind } from './fileNotes.ts'
import { fillInputOf, fillRowIn } from './inputs.ts'
import type { ColumnHeld } from './limited.ts'
import { columnLimit, nextDay, tellLimit } from './limited.ts'
import { failedFor, makeOne } from './making.ts'
import { filledTable } from './marks.ts'
import { countsAsRunning, worksOf } from './notes.ts'
import type { FillPlace } from './places.ts'
import { placesOf } from './places.ts'
import { followLinks, switched, walk } from './walking.ts'

const system = { kind: 'system' } as const

const listOf = (found: unknown): Record<string, unknown>[] =>
  Array.isArray(found) ? found.map((one) => Object(one)) : []

/** The pass of the filled columns of an app, on its writer. */
export interface Filling {
  // Looks again soon: a write marked a value due.
  poke(): void
  // Looks at once at what the filled columns of the running version rest on, in the switch that made it run.
  switched(): void
  close(): void
}

/** One value that is to be made: its row, the file it stands in, how often it was tried, and the moment it became due. */
interface Due {
  place: FillPlace
  rowId: string
  tries: number
  at: number
  missing: boolean
}

/**
 * The values of a group that are to be made now, in the order its `order` says: those that are due and whose
 * moment has come, a missing value before one that is old where it says `missing`, and after them the values that
 * a work which counts no more made, which became due at the switch. Answers them, and the next moment one is due.
 */
function dueOf(o: Opened, group: FillGroup, now: number): { due: Due[]; next?: number } {
  const [first] = group.columns
  if (!first) return { due: [] }
  const works = worksOf(o.store, first)
  const due: Due[] = []
  let next: number | undefined
  for (const place of placesOf(o, group.table)) {
    const rows = listOf(
      place.store.read(
        {
          from: filledTable,
          where: {
            all: [
              { col: 'tableName', is: group.table },
              { col: 'columnName', is: first.column },
            ],
          },
        },
        system,
      ).value,
    )
    for (const row of rows) {
      const at = momentOf(row.dueAt) ?? 0
      const missing = row.madeAt === undefined || row.madeAt === null
      const one = { place, rowId: String(row.rowId), tries: Number(row.tries ?? 0), missing }
      if (row.state === 'due') {
        if (at <= now) due.push({ ...one, at })
        else next = next === undefined ? at : Math.min(next, at)
      } else if (row.state === 'made' && !countsAsRunning(works, row.work)) due.push({ ...one, at: works?.at ?? 0 })
    }
  }
  due.sort((a, b) => (group.order === 'missing' ? Number(b.missing) - Number(a.missing) : 0) || a.at - b.at)
  return { due, ...(next === undefined ? {} : { next }) }
}

/** Fails the rows of a column whose `by` states `atLimit: 'fail'` at its limit: each counts a try, with T7102. */
function failAtLimit(o: Opened, group: FillGroup, rows: Due[], held: ColumnHeld): void {
  const error = new TentError(
    'T7102',
    `The filling of the column reached its limit \`perDay\` of ${held.limit} ${held.unit}.`,
    { fields: { limit: 'perDay', unit: held.unit }, fix: 'Raise `limits.perDay` of its `by`, or let it wait.' },
  )
  for (const one of rows) {
    const row = fillRowIn(one.place.store, group.table, one.rowId)
    if (row) failedFor(o, group, one.place, one.rowId, fillInputOf(o, one.place.store, group, row), one.tries, error)
  }
}

/**
 * Takes what the engine holds of an app that writes. Keeps its filled columns made: at once, after each write that
 * marked a value, and at the moment the next value is due, it walks what is to be walked, marks the rows that read
 * a changed row through a link, and makes each value that is due, a group after the groups whose columns it reads,
 * held to `perMinute` of its `by`. It is work that nobody waits for.
 */
export function keepFilling(o: Opened): Filling {
  let cancel: (() => void) | undefined
  let running: Promise<void> | undefined
  let again = false
  let closed = false
  // How many values of each group were made in the minute that is running.
  const minutes = new Map<string, { since: number; n: number }>()

  const arm = (at: number | undefined): void => {
    cancel?.()
    cancel = undefined
    if (closed || at === undefined) return
    cancel = o.clock.setTimer(Math.max(at, o.clock.now() + 1), poke)
  }

  async function round(): Promise<void> {
    const groups = fillGroups(o.description)
    if (!groups.length || o.closed) return
    switched(o, groups)
    openDue(o)
    let more = openBehind(o, poke)
    more = walk(o, groups) || more
    more = followLinks(o, groups) || more
    let next: number | undefined
    for (const group of groups) {
      const now = o.clock.now()
      const { due, next: later } = dueOf(o, group, now)
      if (later !== undefined) next = next === undefined ? later : Math.min(next, later)
      // A vector column whose model makes it hands `batch` rows to one call; any other work takes one row.
      const size = group.embed?.batch ?? 1
      for (let at = 0; at < due.length; at += size) {
        if (closed || o.closed) return
        const rows = due.slice(at, at + size)
        const minute = minutes.get(group.key) ?? { since: now, n: 0 }
        if (o.clock.now() - minute.since >= 60_000) Object.assign(minute, { since: o.clock.now(), n: 0 })
        if (group.perMinute !== undefined && minute.n >= group.perMinute) {
          next = next === undefined ? minute.since + 60_000 : Math.min(next, minute.since + 60_000)
          break
        }
        // A limit of the day holds the column back: its rows stay due, and are taken up again the next day.
        const held = columnLimit(o, group)
        if (held && group.atLimit === 'fail') {
          failAtLimit(o, group, rows, held)
          continue
        }
        if (held) tellLimit(o, group, held)
        const [first] = rows
        if (!first) break
        const made = held
          ? 'limited'
          : group.embed
            ? await makeEmbeds(o, group, rows)
            : await makeOne(o, group, first.place, first.rowId, first.tries)
        if (made === 'limited') {
          next = next === undefined ? nextDay(o) : Math.min(next, nextDay(o))
          break
        }
        minute.n += rows.length
        minutes.set(group.key, minute)
        // A made value may have marked another group: the next round makes it.
        more = true
      }
    }
    const fillAt = nextFillAt(o)
    if (fillAt !== undefined) next = next === undefined ? fillAt : Math.min(next, fillAt)
    if (more) setImmediate(poke)
    else arm(next)
  }

  function poke(): void {
    if (closed) return
    if (running) {
      again = true
      return
    }
    running = (async () => {
      try {
        do {
          again = false
          await round()
        } while (again && !closed)
      } catch (error) {
        o.log.write('lines', {
          at: o.clock.now(),
          level: 'error',
          message: `The pass of the filled columns failed: ${String(error)}`,
        })
      } finally {
        running = undefined
      }
    })()
    o.inFlight.add(running)
    const left = running
    void left.finally(() => o.inFlight.delete(left))
  }

  setImmediate(poke)
  return {
    poke: () => void setImmediate(poke),
    switched() {
      if (closed) return
      switched(o, fillGroups(o.description))
      setImmediate(poke)
    },
    close() {
      closed = true
      cancel?.()
    },
  }
}
