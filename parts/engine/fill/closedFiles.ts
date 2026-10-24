import type { Store } from '../../data/index.ts'
import { momentOf } from '../moment.ts'
import type { Opened } from '../opened.ts'
import { directoryTable } from '../files/directory.ts'
import { filledTable } from './marks.ts'

const system = { kind: 'system' } as const

const listOf = (found: unknown): Record<string, unknown>[] =>
  Array.isArray(found) ? found.map((one) => Object(one)) : []

/** The earliest moment at which a value of a file is due, read before the file closes, or nothing where none is due. */
export function fillAtOf(store: Store): number | undefined {
  if (!store.layout().some((one) => one.name === filledTable)) return undefined
  const [first] = listOf(
    store.read({ from: filledTable, where: { col: 'state', is: 'due' }, sort: [{ by: 'dueAt' }], limit: 1 }, system)
      .value,
  )
  return momentOf(first?.dueAt)
}

/** Opens each closed file of a tenant whose `fillAt` has come, so that the pass makes its values. */
export function openDue(o: Opened): void {
  if (!o.files) return
  const now = o.clock.now()
  const rows = listOf(o.store.read({ from: directoryTable.name, where: { col: 'open', is: 0 } }, system).value)
  for (const row of rows) {
    const at = momentOf(row.fillAt)
    if (at === undefined || at > now) continue
    o.files.of({ table: String(row.tableName), id: String(row.rowId) })
  }
}

/** The earliest `fillAt` of the files that are closed, for the pass to look again then. */
export function nextFillAt(o: Opened): number | undefined {
  if (!o.files) return undefined
  let next: number | undefined
  for (const row of listOf(o.store.read({ from: directoryTable.name, where: { col: 'open', is: 0 } }, system).value)) {
    const at = momentOf(row.fillAt)
    if (at !== undefined) next = next === undefined ? at : Math.min(next, at)
  }
  return next
}
