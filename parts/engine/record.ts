import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { ChangeSink, Row, Store, TableLayout, TableStep } from '../data/index.ts'
import { applySteps } from '../data/index.ts'
import { heldBy, manyLimit } from './held.ts'
import type { Opened } from './opened.ts'

type Whole = Parameters<NonNullable<ChangeSink['renew']>>[0]

const system = { kind: 'system' } as const

/** What the engine knows of a sink that is the place of record: the newest write it took, and the one it is handed now. */
interface PlaceOfRecord {
  taken: number
  handed?: { n: number; at: number }
  waiting: { n: number; done(): void }[]
}

// The place of record of each app, kept under its handles: every record that the engine holds of one app shares those.
const places = new WeakMap<object, PlaceOfRecord>()

// The apps that read: the sink of a reader is started by none, until the reader takes over.
const reading = new WeakSet<object>()

/** Has the sink of a reader that takes over started from now on, as the sink of the writer it is. */
export const writesNow = (o: Opened): void => void reading.delete(o.handles)

/**
 * Takes an app, whether it is a reader, and the sink that its makers made. On a reader the sink is started by
 * nothing: the sink is the writer's, and a reader that takes over starts it. Answers the sink as the data is
 * handed it: where it states
 * `held`, the engine notes the newest write it took, and the write it is handed, so that an answer waits for it
 * and a write is refused once it has been behind too long. Any other sink is answered as it is.
 */
export function recorded(o: Opened, sink: ChangeSink, reads: boolean): ChangeSink {
  if (reads) reading.add(o.handles)
  // A start on a reader is answered never: the data it applies is handed on by its writer.
  const started = (n: number): ReturnType<ChangeSink['start']> =>
    reading.has(o.handles) ? new Promise<never>(() => undefined) : sink.start(n)
  // A sink that states `records` is handed each record of a write, as it said it is to be.
  const each = sink.records === true ? { records: true as const } : {}
  if (sink.held !== true) return { start: started, wrote: (change) => sink.wrote(change), ...each }
  const record: PlaceOfRecord = { taken: 0, waiting: [] }
  places.set(o.handles, record)
  const took = (n: number): void => {
    record.taken = Math.max(record.taken, n)
    for (const one of record.waiting.filter((waits) => waits.n <= record.taken)) one.done()
    record.waiting = record.waiting.filter((waits) => waits.n > record.taken)
  }
  return {
    held: true,
    ...each,
    ...(sink.source ? { source: sink.source } : {}),
    ...(sink.renew
      ? {
          renew: async (whole: Whole) => {
            await sink.renew?.(whole)
            took(whole.n)
          },
        }
      : {}),
    async start(n) {
      const answer = await started(n)
      took(typeof answer === 'object' ? answer.n : answer)
      return answer
    },
    async wrote(change) {
      record.handed = { n: change.n, at: change.at }
      await sink.wrote(change)
      record.handed = undefined
      took(change.n)
    },
  }
}

/**
 * Takes an app, and the number of a write where an answer rests on another than the newest. Answers once the place
 * of record took that write: an answer is never given of a write that the record lacks. An app with no such sink
 * waits for nothing.
 */
export function recordTook(
  o: Pick<Opened, 'store' | 'tenantFiles'> & { handles?: object },
  at?: number,
): Promise<void> {
  const record = o.handles ? places.get(o.handles) : undefined
  if (!record) return Promise.resolve()
  const n = at ?? heldBy(o)
  if (record.taken >= n) return Promise.resolve()
  return new Promise((done) => record.waiting.push({ n, done }))
}

/** Throws T0031 where the oldest write that waits for the place of record has waited for `limits.behind`. */
export function recordHolds(o: Opened): void {
  const record = places.get(o.handles)
  const handed = record?.handed
  if (!handed || o.clock.now() - handed.at < manyLimit(o.description, 'behind')) return
  throw new TentError('T0031', 'The place of record of this app has been behind for longer than `limits.behind`.', {
    fix: 'Ask again once the place of record has taken what waits for it.',
  })
}

/** The tables of a layout, those that others link to before them, so that every row it links to is in already. */
function inOrder(layout: TableLayout[]): TableLayout[] {
  const linked = (table: TableLayout): string[] =>
    Object.values(table.columns).flatMap((type) => {
      const to: unknown = Reflect.get(Object(type), 'table')
      return Reflect.get(Object(type), 'kind') === 'link' && typeof to === 'string' && to !== table.name ? [to] : []
    })
  const placed: TableLayout[] = []
  const left = [...layout]
  while (left.length) {
    const next = left.findIndex((table) =>
      linked(table).every((to) => placed.some((one) => one.name === to) || !left.some((one) => one.name === to)),
    )
    placed.push(...left.splice(next < 0 ? 0 : next, 1))
  }
  return placed
}

/**
 * Takes an app's store, its data folder, a sink that is the place of record, and the tables of a machine alone. Where the folder holds no data
 * and the sink states `source`, makes the data file from all it holds: its layout, and every row in one write, the
 * rows of each table in the order of their ids, with the number it gave. Answers whether it made one: the data
 * then begins a new epoch once the machine knows its id, so that readers of an earlier file fetch the data.
 */
export async function builtFrom(
  store: Store,
  dataFolder: string,
  sink: ChangeSink | undefined,
  own: TableLayout[],
): Promise<boolean> {
  if (!sink?.source || existsSync(join(dataFolder, 'data.db'))) return false
  const whole = await sink.source()
  const tables: { table: string; rows: Row[] }[] = []
  for await (const one of whole.tables) tables.push({ table: one.table, rows: one.rows })
  store.open(dataFolder)
  try {
    // A table that the store makes by itself as it opens is there already.
    const there = new Set(store.layout().map((one) => one.name))
    // The tables of this machine alone are made beside them: the place of record holds none of them.
    const steps: TableStep[] = [...own, ...inOrder(whole.layout)]
      .filter((one) => !there.has(one.name))
      .map((one) => ({ do: 'addTable', table: one.name, layout: one }))
    store.write((tx) => applySteps(tx, store, steps), { steps: true })
    store.write((tx) => {
      for (const table of inOrder(whole.layout)) {
        // A table that states a key of several columns finds its row by all of them, as the store keys it.
        const key = table.key && table.key.length > 1 ? table.key : undefined
        for (const row of tables
          .filter((one) => one.table === table.name)
          .flatMap((one) => one.rows)
          .sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
          const id = key ? Object.fromEntries(key.map((column) => [column, row[column]])) : String(row.id ?? row.key)
          if (tx.read({ from: table.name, one: 'get', id }, system) === undefined) tx.add(table.name, row, system)
          else {
            // A row that the store made by itself as it opened is changed, but for the key that names it.
            const { id: _id, key: _key, ...rest } = row
            tx.change(table.name, id, rest, system)
          }
        }
      }
    })
  } finally {
    store.close()
  }
  return true
}
