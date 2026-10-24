import type { Description } from '../core/internal.ts'
import type { Seal, Searcher, Wrote } from './context.ts'
import { createDb } from './createDb.ts'
import type { FileName, Touched } from './fileName.ts'
import type { Files } from './files.ts'
import { insideOf } from './filesInside.ts'
import { forgetPeople } from './forgetPeople.ts'
import { setMeta } from './here.ts'
import { heldMeta, toldCount } from './metaKeys.ts'
import type { TableModel } from './model.ts'
import { tableNames, tableOf } from './model.ts'
import type { Row, Store, Tx } from './store.ts'
import { historyTable } from './tables.ts'

const system = { kind: 'system' } as const

// How many ids one question of the shared file names: SQLite takes so many values in one statement.
const batch = 5000

const rowsOf = (read: unknown): Row[] => (Array.isArray(read) ? read : [])

/** The values that the rows of a table of a file hold in one column, each once. */
function valuesIn(store: Store, table: string, column: string): string[] {
  const records = rowsOf(store.read({ from: table, group: { by: [column], values: {} } }, system).value)
  return records.map((record) => record[column]).filter((value) => typeof value === 'string')
}

/** Answers which rows of a table of the shared file are gone, of the ids a file holds of them. */
function goneOf(shared: Store, table: string, ids: string[]): string[] {
  const there = new Set<unknown>()
  for (let at = 0; at < ids.length; at += batch) {
    const plan = { from: table, where: { col: 'id', in: ids.slice(at, at + batch) }, pick: ['id'] }
    for (const row of rowsOf(shared.read(plan, system).value)) there.add(row.id)
  }
  return ids.filter((id) => !there.has(id))
}

/** A link column of a table of a file that points into the shared file, with the rows of the shared file that are gone. */
interface Loose {
  model: TableModel
  column: string
  onRemove: string
  to: string
  gone: string[]
}

/**
 * Takes the files of an app, the file of one tenant, the description, and what is told of each row. Sweeps the
 * file where it stands at another count of removals than the shared file tells: for each link column that points
 * into the shared file, and for who changed a row in the kept earlier versions, it takes the ids the file holds
 * and asks the shared file which of them are gone. In one write of the file, which then holds the new count, it
 * removes or clears the rows that link to them, by what `onRemove` says, each told to `wrote` as any removal and
 * any change is. For a person who is gone it removes the kept earlier versions of the rows it removed, writes
 * `removed` in place of them where the history names who changed a row, and hands their ids to `gone`. Answers how
 * many rows it removed and cleared, and what the write touched. A file that stands at the count is written nothing.
 */
export function sweep(
  files: Files,
  file: FileName,
  description: Description,
  o: { wrote: (w: Wrote) => void; gone?: (users: string[], tx: Tx) => void; seal?: Seal; searcher?: Searcher },
): { removed: number; cleared: number; touched: Touched[] } {
  const inside = insideOf(files)
  const store = files.of(file)
  const told = toldCount(inside.shared)
  if (!store || heldMeta(store, 'swept') === told) return { removed: 0, cleared: 0, touched: [] }

  const loose: Loose[] = []
  for (const name of tableNames(description)) {
    const model = tableOf(description, name)
    if (model.tenantTable !== file.table || !inside.holds(file, name)) continue
    for (const [column, type] of Object.entries(model.columns)) {
      // The rows of a tenant that is gone go with its file, and no trigger fires for them.
      if (type.kind !== 'link' || column === model.tenant || tableOf(description, type.table).tenantTable !== undefined)
        continue
      const gone = goneOf(inside.shared, type.table, valuesIn(store, name, column))
      if (gone.length) loose.push({ model, column, onRemove: type.onRemove ?? 'refuse', to: type.table, gone })
    }
  }
  // Who changed a row is kept as `user:<id>`.
  const hasHistory = inside.holds(file, historyTable.name)
  const changers = hasHistory
    ? valuesIn(store, historyTable.name, 'by').flatMap((by) => (by.startsWith('user:') ? [by.slice(5)] : []))
    : []
  const hasUsers = tableNames(description).includes('users')
  const users = new Set([
    ...loose.filter((one) => one.to === 'users').flatMap((one) => one.gone),
    ...(hasUsers ? goneOf(inside.shared, 'users', changers) : []),
  ])

  let removed = 0
  let cleared = 0
  // The rows that go because a person is gone: their kept earlier versions go with them.
  const ofUsers: { table: string; id: string }[] = []
  let forUser = false
  const answer = files.write((w) => {
    const db = createDb(
      w,
      description,
      system,
      'write',
      {},
      {
        wrote(written) {
          if (written.kind === 'removed') {
            removed++
            if (forUser) ofUsers.push({ table: written.table, id: String(written.row.id) })
          } else if (written.kind === 'changed') cleared++
          o.wrote(written)
        },
        ...(o.seal ? { seal: o.seal } : {}),
        ...(o.searcher ? { searcher: o.searcher } : {}),
      },
    )
    for (const { model, column, onRemove, to, gone } of loose) {
      forUser = to === 'users'
      for (let at = 0; at < gone.length; at += batch) {
        const where = { col: column, in: gone.slice(at, at + batch) }
        for (const row of rowsOf(db.read({ from: model.name, of: file.id, where, pick: ['id'] }))) {
          // A row that went with a row removed before it is gone already.
          if (db.read({ from: model.name, of: file.id, one: 'get', id: row.id }) === undefined) continue
          if (onRemove === 'remove') db.write([{ remove: model.name, of: file.id, id: row.id }])
          else db.write([{ change: model.name, of: file.id, id: row.id, values: { [column]: null } }])
        }
      }
    }
    const tx = w.tx(file)
    if (users.size && inside.holds(file, historyTable.name)) forgetPeople(tx, description, ofUsers, users)
    if (users.size) o.gone?.([...users], tx)
    setMeta(tx, 'swept', told)
  })
  return { removed, cleared, touched: answer.touched }
}
