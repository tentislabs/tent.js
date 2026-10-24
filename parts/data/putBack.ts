import type { Description } from '../core/internal.ts'
import type { Wrote } from './context.ts'
import { countedRow } from './counting.ts'
import { tableOf } from './model.ts'
import type { Row, Tx } from './store.ts'

const system = { kind: 'system' } as const

/**
 * Takes a write, a description, a table, the id of a row, and the values it is to hold again as the store keeps
 * them, a sealed value as its sealed text. Puts the row back: added again with its id where it is gone, or set back
 * where it stands. The kept numbers that count the table move with it, in the same write. Answers what was written,
 * as a write of `db` tells it, the kept numbers among it, so that whoever listens to the writes follows it.
 */
export function putBack(tx: Tx, description: Description, table: string, id: string, values: Row): Wrote[] {
  const model = tableOf(description, table)
  const held: unknown = tx.read({ from: table, one: 'get', id }, system)
  const before = typeof held === 'object' && held !== null && !Array.isArray(held) ? { ...held } : undefined
  const written: Wrote = before
    ? { table, kind: 'changed', row: tx.change(table, id, values, system), before, columns: Object.keys(values) }
    : { table, kind: 'added', row: tx.add(table, { ...values, id }, system) }
  return [written, ...countedRow(tx, model.counted, before, written.row)]
}
