import type { Caller } from '../core/index.ts'
import { isStored } from '../core/internal.ts'
import type { Wrote } from './context.ts'
import { applySteps } from './applySteps.ts'
import type { Row, Store, TableLayout } from './store.ts'

const system: Caller = { kind: 'system' }

// The moments that every row holds, which a layout does not name.
const moments = ['createdAt', 'updatedAt']

/** Whether a value is a row that a writer handed on the link: of a table, of a kind, with its row. */
export const isWrote = (value: unknown): value is Wrote =>
  isStored(value) &&
  typeof value.table === 'string' &&
  (value.kind === 'added' || value.kind === 'changed' || value.kind === 'removed') &&
  isStored(value.row) &&
  typeof value.row.id === 'string'

/**
 * Takes the store of a reader, the rows of tables kept in memory that its writer wrote, as they came on the link,
 * and the layout of the tables that the app keeps in memory. Makes each such table that the store lacks: it is made
 * anew each time the store is opened. Writes each row into its table, in one write that takes no number: such rows
 * are kept in no record. A row of any other table is left alone.
 */
export function applyMemory(store: Store, rows: Wrote[], kept: TableLayout[]): void {
  const there = new Set(store.layout().map((one) => one.name))
  const lacking = kept.filter((one) => one.memory && !there.has(one.name))
  const layouts = new Map(kept.map((one) => [one.name, one]))
  const steps = lacking.map((layout) => ({ do: 'addTable' as const, table: layout.name, layout }))
  store.write(
    (tx) => {
      if (steps.length) applySteps(tx, store, steps)
      for (const { table, kind, row } of rows) {
        const layout = layouts.get(table)
        if (!layout?.memory) continue
        const id = String(row.id)
        // A moment came as its text on the link: the store holds it as a date again.
        const values: Row = Object.fromEntries(
          Object.entries(row).map(([name, value]) => [
            name,
            (layout.columns[name]?.kind === 'date' || moments.includes(name)) && typeof value === 'string'
              ? new Date(value)
              : value,
          ]),
        )
        const there = tx.read({ from: table, one: 'get', id }, system) !== undefined
        if (kind === 'removed') {
          if (there) tx.remove(table, id, system)
        } else if (there) {
          const { id: _, ...rest } = values
          tx.change(table, id, rest, system)
        } else tx.add(table, values, system)
      }
    },
    steps.length ? { steps: true } : {},
  )
}

/** Takes the store of a writer. Answers every row that it keeps in memory, as added: what a reader that joins is handed. */
export function memoryHeld(store: Store): Wrote[] {
  return store.layout().flatMap((one) => {
    if (!one.memory) return []
    const rows: unknown = store.read({ from: one.name }, system).value
    return (Array.isArray(rows) ? rows : [])
      .filter(isStored)
      .map((row): Wrote => ({ table: one.name, kind: 'added', row }))
  })
}
