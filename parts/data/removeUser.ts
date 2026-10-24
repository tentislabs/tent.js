import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import type { Seal } from './context.ts'
import { createDb } from './createDb.ts'
import { forgetPeople } from './forgetPeople.ts'
import type { TableModel } from './model.ts'
import { tableNames, tableOf } from './model.ts'
import type { Row, Tx } from './store.ts'

const system = { kind: 'system' } as const

// No key is needed to clear a link: a sealed value of a row that is cleared is handed on as it is stored, and
// nothing here seals one.
const unopened: Seal = {
  open: (sealed) => sealed,
  close(_value, bound) {
    throw new TentError('T0019', `The removal of a person holds no key, and was asked to seal ${bound}.`)
  },
}

/** Rows that link to a row of the person with a link that refuses: they stay, and the row they link to stays with them. */
export interface Refused {
  table: string
  column: string
  rows: number
  // The table of the row that could not be removed.
  of: string
}

/** What the removal of a person did: how many rows of each table it removed, and what it could not remove. */
export interface Removal {
  removed: Record<string, number>
  refused: Refused[]
}

/**
 * Takes the write it works in, the description and the id of a person. Removes every row in every table whose
 * `owner` is that person, and their row of `users`, following what each link that points at such a row says with
 * `onRemove`: the rows of a link that removes are removed, those of a link that clears are cleared, and a row that
 * a refusing link points at stays, with the rows that link to it, which is reported. It removes the kept earlier
 * versions of every row it removed, and writes `removed` in place of the person where `_t_history` names them as
 * who changed a row. It needs no key: a row that it clears is not opened, and its sealed values stand as they are
 * stored. Answers what it removed and what it could not. The rest of a person's removal - their runs,
 * their files, what was counted - is done by the engine in the same write.
 */
export function removeUser(tx: Tx, description: Description, id: string): Removal {
  const gone: { table: string; id: string }[] = []
  const db = createDb(
    tx,
    description,
    system,
    'write',
    {},
    {
      wrote: (w) => {
        if (w.kind === 'removed') gone.push({ table: w.table, id: String(w.row.id) })
      },
      seal: unopened,
    },
  )
  const rowsOf = (table: string, column: string, value: string): Row[] => {
    const rows = tx.read({ from: table, where: { col: column, is: value } }, system)
    return Array.isArray(rows) ? rows : []
  }

  /** Removes one row with what links to it. Answers whether it is gone: a row that a refusing link points at stays. */
  const remove = (model: TableModel, row: string, refused?: Refused[], seen = new Set<string>()): boolean => {
    // A row that is met again on its own way is being removed: the removal of the first takes it along.
    if (seen.has(`${model.name} ${row}`)) return true
    seen.add(`${model.name} ${row}`)
    let held = false
    for (const link of model.referrers) {
      // The rows of a tenant table stand in the files of tenants: the sweep of each file takes them.
      if (tableOf(description, link.table).tenantTable !== model.tenantTable) continue
      const linking = rowsOf(link.table, link.column, row)
      if (!linking.length) continue
      if (link.onRemove === 'refuse') {
        refused?.push({ table: link.table, column: link.column, rows: linking.length, of: model.name })
        held = true
      } else if (link.onRemove === 'remove') {
        const linked = tableOf(description, link.table)
        for (const one of linking) if (!remove(linked, String(one.id), refused, seen)) held = true
      } else db.write(linking.map((one) => ({ change: link.table, id: one.id, values: { [link.column]: null } })))
    }
    if (!held) db.write([{ remove: model.name, id: row }])
    return !held
  }

  const names = tableNames(description)
  let left: { model: TableModel; id: string }[] = names.flatMap((name) => {
    const model = tableOf(description, name)
    if (model.owner === undefined || model.tenantTable !== undefined) return []
    return rowsOf(name, model.owner, id).map((row) => ({ model, id: String(row.id) }))
  })
  // The row of the person itself comes last: the rows they own link to it.
  if (names.includes('users') && tx.read({ from: 'users', one: 'get', id }, system))
    left.push({ model: tableOf(description, 'users'), id })
  // A row of the person may link to another row of theirs with a link that refuses: each pass removes what it can,
  // and what is left when a pass removes nothing is reported.
  for (let before = left.length + 1; left.length < before; ) {
    before = left.length
    left = left.filter((one) => !remove(one.model, one.id))
  }
  const refused: Refused[] = []
  for (const one of left) remove(one.model, one.id, refused)

  const removed: Record<string, number> = {}
  for (const { table } of gone) removed[table] = (removed[table] ?? 0) + 1
  if (names.some((name) => tableOf(description, name).keepHistory)) forgetPeople(tx, description, gone, [id])
  return { removed, refused }
}
