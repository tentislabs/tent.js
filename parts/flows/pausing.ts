import type { Store } from '../data/index.ts'
import { metaTable } from '../data/index.ts'
import type { Source } from './rows.ts'
import { inWrite, readOf, system } from './rows.ts'

// The key of `_t_meta` under which the shared file keeps the flows that are paused, so every machine reads them.
const pausedKey = 'pausedFlows'

/** Answers the flows that a data file keeps as paused, in the order of their names. None where it keeps none. */
export function pausedIn(source: Source): string[] {
  if ('layout' in source && !source.layout().some((one) => one.name === metaTable.name)) return []
  const row: unknown = readOf(source, { from: metaTable.name, one: 'get', id: pausedKey })
  const value: unknown = typeof row === 'object' && row !== null ? Reflect.get(row, 'value') : undefined
  return Array.isArray(value) ? value.map(String).sort() : []
}

/** Writes the flows that are paused into the shared file, in one write of their own: the row goes where none is. */
export function writePaused(store: Store, flows: string[]): void {
  inWrite(store, (tx) => {
    const there = tx.read({ from: metaTable.name, one: 'get', id: pausedKey }, system) !== undefined
    const value = [...new Set(flows)].sort()
    if (!value.length) {
      if (there) tx.remove(metaTable.name, pausedKey, system)
    } else if (there) tx.change(metaTable.name, pausedKey, { value }, system)
    else tx.add(metaTable.name, { key: pausedKey, value }, system)
  })
}
