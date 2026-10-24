import type { Tx } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/counts.ts'
import { book, countsRemoved } from './book.ts'

const system = { kind: 'system' } as const

/**
 * The counts' part of a person's removal, in the write that removes their rows: each row of `_t_counts` that names
 * them is added into the row of `removed` of its day, its thing, its answer and its unit, and goes. So the counts of
 * the app stay whole, and no row names the person: a count that reaches the counts for them later is booked
 * under `removed` too.
 */
export function forgetCounts(o: Opened, tx: Tx, id: string): void {
  countsRemoved(o, id)
  const read: unknown = tx.read({ from: table.name, where: { col: 'user', is: id } }, system)
  for (const row of Array.isArray(read) ? read : []) {
    const at = (name: string): unknown => Reflect.get(Object(row), name)
    const key = {
      day: at('day'),
      name: at('name'),
      answeredBy: at('answeredBy'),
      caller: at('caller'),
      unit: at('unit'),
    }
    tx.remove(table.name, key, system)
    const amount = at('amount')
    if (typeof amount !== 'number') continue
    book(o, tx, [
      {
        day: new Date(String(key.day instanceof Date ? key.day.toISOString() : key.day)),
        name: String(key.name),
        answeredBy: String(key.answeredBy),
        caller: 'removed',
        unit: String(key.unit),
        amount,
      },
    ])
  }
}
