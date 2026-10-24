import { here } from '../../data/index.ts'
import type { Link } from '../copy/link.ts'
import { tell } from '../copy/link.ts'
import type { Opened } from '../opened.ts'
import { table as countingTable } from '../tables/counting.ts'
import type { Booked } from './book.ts'
import { book } from './book.ts'
import type { CountBy } from './by.ts'
import { dayOf } from './day.ts'
import type { Gathered } from './gather.ts'
import { countEveryOf, countsGoTo, ownWrite } from './gather.ts'

const system = { kind: 'system' } as const

// The moment at which this program started: a batch of a reader names it, so that its numbers begin anew with it.
const started = Date.now()

// The units that are levels, whose rows hold the highest amount and are never added.
const peaks = ['livePeak', 'fileBytesPeak', 'dataBytesPeak']

/** One thing of a batch: what was used, what answered it, its caller, and its amounts by unit. */
interface Used {
  name: string
  answeredBy: string
  caller: string
  user?: string
  units: Record<string, number>
}

/** What a reader holds of the batches that it sent and its writer has not written yet. */
interface Sending {
  n: number
  pending: { n: number; used: Used[] }[]
  link?: Link
}

const sending = new WeakMap<Opened, Sending>()

/** The amounts of a batch, each thing once with its units: the peaks of a reader stand under its machine id. */
function usedOf(amounts: Gathered[], machine: string): Used[] {
  const things = new Map<string, Used>()
  for (const one of amounts) {
    const answeredBy = peaks.includes(one.unit) ? machine : one.answeredBy
    const key = [one.name, answeredBy, one.caller].join('\n')
    const thing = things.get(key) ?? {
      name: one.name,
      answeredBy,
      caller: one.caller,
      ...(one.user ? { user: one.user } : {}),
      units: {},
    }
    thing.units[one.unit] = (thing.units[one.unit] ?? 0) + one.amount
    things.set(key, thing)
  }
  return [...things.values()]
}

/** The number of the last batch of a machine that the copy of `_t_counting` on this machine says was written. */
function writtenOf(o: Opened, machine: string): { start: number; n: number } | undefined {
  const row: unknown = o.store.read({ from: countingTable.name, one: 'get', id: `batch:${machine}` }, system).value
  const value: unknown = Reflect.get(Object(row), 'value')
  const start: unknown = Reflect.get(Object(value), 'start')
  const n: unknown = Reflect.get(Object(value), 'n')
  return typeof start === 'number' && typeof n === 'number' ? { start, n } : undefined
}

/**
 * Takes a reader, the link to its writer as it opens, and how the writer counts. From then on the reader counts as
 * its writer does, and hands what it counted to the writer in batches, once every `countEvery`: each with the moment
 * its program started and a number that grows. A batch is kept until the reader's copy of `_t_counting` says that
 * the writer wrote it, and is sent again over each new link until then.
 */
export function countsToWriter(o: Opened, link: Link, said: unknown): void {
  const told = {
    countBy: ['limits', 'app', 'caller'].find((one) => one === Reflect.get(Object(said), 'countBy')),
    countEvery: Reflect.get(Object(said), 'countEvery'),
    levelEvery: Reflect.get(Object(said), 'levelEvery'),
  }
  o.counting = {
    ...o.counting,
    ...(told.countBy === 'limits' || told.countBy === 'app' || told.countBy === 'caller'
      ? { countBy: told.countBy }
      : {}),
    ...(typeof told.countEvery === 'number' ? { countEvery: told.countEvery } : {}),
    ...(typeof told.levelEvery === 'number' ? { levelEvery: told.levelEvery } : {}),
  }
  const machine = String(here(o.store).id ?? '')
  const held = sending.get(o) ?? { n: 0, pending: [] }
  sending.set(o, held)
  held.link = link
  const written = writtenOf(o, machine)
  held.pending = held.pending.filter((one) => !written || written.start !== started || one.n > written.n)
  for (const one of held.pending) tell(link, { t: 'counted', start: started, n: one.n, used: one.used })
  countsGoTo(o, (amounts) => {
    held.n += 1
    const batch = { n: held.n, used: usedOf(amounts, machine) }
    held.pending.push(batch)
    if (held.link) tell(held.link, { t: 'counted', start: started, n: batch.n, used: batch.used })
  })
}

/** How the writer counts, as it names it to a reader when the link opens. */
export const countingTold = (o: Opened): { countBy?: CountBy; countEvery: number; levelEvery?: number } => ({
  ...(o.counting?.countBy ? { countBy: o.counting.countBy } : {}),
  countEvery: countEveryOf(o),
  ...(o.counting?.levelEvery ? { levelEvery: o.counting.levelEvery } : {}),
})

// The units that the writer alone measures: the machine time of the workers, the level of the data and of the
// files, and what runs and writes, which only the writer does. A reader's batch that holds one is not believed.
const writerOnly = [
  'workSeconds',
  'lostSeconds',
  'loadSeconds',
  'idleSeconds',
  'dataByteSeconds',
  'dataBytesPeak',
  'fileByteSeconds',
  'fileBytesPeak',
  'rowsWritten',
  'runs',
  'steps',
  'workedMs',
]

/**
 * The writer takes a batch of a reader. An amount below zero, and a unit that the writer alone measures, are dropped. A batch whose number is not above the one it kept for that machine, with the
 * same start, was written already and is dropped; one with another start begins the numbers anew. What it holds is
 * booked to the day it arrives, in the write that keeps its number.
 */
export function countedFrom(o: Opened, machine: string, message: Record<string, unknown>): void {
  const start = message.start
  const n = message.n
  if (typeof start !== 'number' || typeof n !== 'number' || !Array.isArray(message.used)) return
  const day = dayOf(o)
  const amounts: Booked[] = []
  for (const one of message.used) {
    const units: unknown = Reflect.get(Object(one), 'units')
    const user: unknown = Reflect.get(Object(one), 'user')
    for (const [unit, amount] of Object.entries(Object(units)))
      if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && !writerOnly.includes(unit))
        amounts.push({
          day,
          name: String(Reflect.get(Object(one), 'name')).slice(0, 200),
          answeredBy: String(Reflect.get(Object(one), 'answeredBy') ?? '').slice(0, 200),
          caller: String(Reflect.get(Object(one), 'caller') ?? '').slice(0, 200),
          ...(typeof user === 'string' ? { user } : {}),
          unit: unit.slice(0, 64),
          amount,
          ...(peaks.includes(unit) ? { peak: true as const } : {}),
        })
  }
  ownWrite(o, () =>
    o.store.write((tx) => {
      const id = `batch:${machine}`
      const row: unknown = tx.read({ from: countingTable.name, one: 'get', id }, system)
      const value: unknown = Reflect.get(Object(row), 'value')
      const kept = { start: Reflect.get(Object(value), 'start'), n: Reflect.get(Object(value), 'n') }
      if (kept.start === start && typeof kept.n === 'number' && n <= kept.n) return
      book(o, tx, amounts)
      if (row) tx.change(countingTable.name, id, { value: { start, n } }, system)
      else tx.add(countingTable.name, { key: id, value: { start, n } }, system)
    }),
  )
}
