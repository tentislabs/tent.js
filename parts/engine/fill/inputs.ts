import type { Store, Tx } from '../../data/index.ts'
import { fingerprintOfText } from '../remember/keyOf.ts'
import type { Opened } from '../opened.ts'
import type { FillGroup } from './columns.ts'
import { isStored } from '../../core/internal.ts'

const system = { kind: 'system' } as const

/** Reads a plan in a store or inside a write. */
const readIn = (on: Store | Tx, plan: Parameters<Store['read']>[0]): unknown =>
  'write' in on ? on.read(plan, system).value : on.read(plan, system)

/** One row of a table by its id, in a store or inside a write, or nothing. */
export function fillRowIn(on: Store | Tx, table: string, id: string): Record<string, unknown> | undefined {
  const row = readIn(on, { from: table, one: 'get', id })
  return isStored(row) ? row : undefined
}

/**
 * What the work of a group is handed for one row: each field of its input the column its `input` names, read
 * through a link of the row to a row of the same file where the name holds a dot; and the fingerprint of it.
 */
export function fillInputOf(
  o: Opened,
  on: Store | Tx,
  group: FillGroup,
  row: Record<string, unknown>,
): { input: Record<string, unknown>; read: string } {
  const columns: unknown = o.description.tables[group.table]?.columns
  const input: Record<string, unknown> = {}
  for (const [field, path] of Object.entries(group.input)) {
    const at = path.indexOf('.')
    if (at === -1) {
      if (row[path] !== undefined && row[path] !== null) input[field] = row[path]
      continue
    }
    const link = path.slice(0, at)
    const type: unknown = Reflect.get(Object(columns), link)
    const target: unknown = Reflect.get(Object(type), 'table')
    const id = row[link]
    const linked = typeof target === 'string' && typeof id === 'string' ? fillRowIn(on, target, id) : undefined
    const value = linked?.[path.slice(at + 1)]
    if (value !== undefined && value !== null) input[field] = value
  }
  return { input, read: fingerprintOfText(JSON.stringify(input)) }
}
