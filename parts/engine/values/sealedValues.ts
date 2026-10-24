import type { Row, StorePlan, TableLayout, Tx } from '../../data/index.ts'
import { foundText, openText, sealText } from './sealing.ts'

const system = { kind: 'system' } as const

/** The two keys of a replacing: the one at hand, and the new one. */
export interface ReplacingKeys {
  old: Uint8Array
  next: Uint8Array
}

/** What a sealed value of a row is bound to, as the seal of the engine binds it. */
const boundOf = (table: unknown, column: string, id: unknown): string =>
  `tent.sealed/1\n${String(table)}.${column}.${String(id)}`

/** The columns of a table that are sealed. */
export const sealedOf = (table: TableLayout): string[] =>
  Object.entries(table.columns)
    .filter(([, type]) => 'sealed' in type && type.sealed === true)
    .map(([name]) => name)

const rowsOf = (read: unknown): Row[] => (Array.isArray(read) ? read : [])

// The column that keeps the fingerprint of a findable sealed column, and what the fingerprint is bound to, as the
// seal of the engine finds a value.
const foundOf = (column: string): string => `${column}__found`
const foundBound = (table: string, column: string): string => `tent.found/1\n${table}.${column}`

/**
 * Walks every sealed value that a data file holds: of each row of a table with a sealed column, and of each kept
 * earlier version of a row, where a text opens under one of the two keys and its place. `seen` is told each, with
 * whether it still opens under the old key alone, and what writes it sealed under the new one.
 */
export function sealedIn(
  read: (plan: StorePlan) => unknown,
  tx: Tx | undefined,
  layout: TableLayout[],
  keys: ReplacingKeys,
  seen: (old: boolean, again: () => void) => void,
): void {
  const state = (text: unknown, bound: string): { opened?: string; old: boolean } | undefined => {
    if (typeof text !== 'string') return undefined
    if (openText(keys.next, text, bound) !== undefined) return { old: false }
    const opened = openText(keys.old, text, bound)
    return opened === undefined ? undefined : { opened, old: true }
  }
  for (const table of layout) {
    const columns = sealedOf(table)
    if (!columns.length || table.name.startsWith('_t_')) continue
    for (const row of rowsOf(read({ from: table.name, pick: ['id', 'updatedAt', ...columns] })))
      for (const column of columns) {
        const bound = boundOf(table.name, column, row.id)
        const held = state(row[column], bound)
        if (!held) continue
        seen(held.old, () => {
          const opened = held.opened ?? ''
          const text = sealText(keys.next, opened, bound)
          // The fingerprint of a findable value is made anew with the new key, in the write that seals it again.
          const found =
            foundOf(column) in table.columns
              ? { [foundOf(column)]: foundText(keys.next, opened, foundBound(table.name, column)) }
              : {}
          tx?.change(table.name, String(row.id), { [column]: text, ...found, updatedAt: row.updatedAt }, system)
        })
      }
  }
  // A kept version holds the sealed text under the names it was kept under, which bind it.
  if (!layout.some((one) => one.name === '_t_history')) return
  for (const version of rowsOf(read({ from: '_t_history' }))) {
    const value: unknown = version.value
    if (typeof value !== 'object' || value === null) continue
    for (const [name, text] of Object.entries(value)) {
      const bound = boundOf(version.tableName, name, version.rowId)
      const held = state(text, bound)
      if (!held) continue
      seen(held.old, () => {
        const turned = { ...Object(read({ from: '_t_history', one: 'get', id: String(version.id) })).value }
        turned[name] = sealText(keys.next, held.opened ?? '', bound)
        tx?.change('_t_history', String(version.id), { value: turned }, system)
      })
    }
  }
}
