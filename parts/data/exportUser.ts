import type { Description } from '../core/internal.ts'
import type { Seal } from './context.ts'
import { boundOf } from './context.ts'
import type { Files } from './files.ts'
import type { TableModel } from './model.ts'
import { tableNames, tableOf } from './model.ts'
import type { Row, Store } from './store.ts'
import { visitFiles } from './visitFiles.ts'

const system = { kind: 'system' } as const

/** What is kept of one person: their id, their row of `users` where there is one, and their rows of each table that states an owner. */
export interface UserData {
  id: string
  user?: Row
  rows: Record<string, Row[]>
}

/** The rows of one table whose owner is a person, as a store holds them: none where the store does not hold the table. */
function ownedIn(store: Store, held: Set<string>, table: string, owner: string, id: string): Row[] {
  if (!held.has(table)) return []
  const owned = store.read({ from: table, where: { col: owner, is: id } }, system).value
  return Array.isArray(owned) ? owned : []
}

/** Opens the sealed values of rows of one table, in place, each under the bound of its row. With no seal they stand as they are. */
function unsealed(seal: Seal | undefined, model: TableModel, rows: Row[]): Row[] {
  if (!seal) return rows
  for (const row of rows)
    for (const column of model.sealed) {
      const sealed = row[column]
      if (typeof sealed === 'string') row[column] = seal.open(sealed, boundOf(model.name, column, row.id))
    }
  return rows
}

const tablesOf = (store: Store): Set<string> => new Set(store.layout().map((one) => one.name))

/**
 * Takes a store, the description, the id of a person, and in `seal` what opens a sealed value. Answers every row
 * in every table whose `owner` is that person, and their row of `users`, as one value that is written as JSON. The
 * rows are as the store holds them: with the columns that only full access reads, and no vector. With `seal` each
 * sealed value of those rows is opened, since it is their own data; without it the value stands sealed, as it is
 * stored. Handed the files of an app, it answers a promise: the tables of the shared file are read there, and
 * every tenant's file is visited, to read alone, for the rows of the tenant tables.
 */
export function exportUser(store: Store, description: Description, id: string, o?: { seal?: Seal }): UserData
export function exportUser(files: Files, description: Description, id: string, o?: { seal?: Seal }): Promise<UserData>
export function exportUser(
  on: Store | Files,
  description: Description,
  id: string,
  o: { seal?: Seal } = {},
): UserData | Promise<UserData> {
  const owned = tableNames(description).flatMap((name) => {
    const model = tableOf(description, name)
    // A row kept in memory is no data that a person is handed: it is gone by itself.
    return model.owner === undefined || model.memory ? [] : [{ name, owner: model.owner, model }]
  })
  const shared = 'shared' in on ? on.shared : on
  const held = tablesOf(shared)
  const rows: Record<string, Row[]> = {}
  for (const { name, owner, model } of owned)
    rows[name] =
      model.tenantTable === undefined || !('shared' in on)
        ? unsealed(o.seal, model, ownedIn(shared, held, name, owner, id))
        : []
  const user = held.has('users') ? shared.read({ from: 'users', one: 'get', id }, system).value : undefined
  const person: UserData = { id, rows }
  if (typeof user === 'object' && !Array.isArray(user))
    [person.user] = unsealed(o.seal, tableOf(description, 'users'), [user])
  if (!('shared' in on)) return person
  return visitFiles(on, (store, file) => {
    const inFile = tablesOf(store)
    for (const { name, owner, model } of owned)
      if (model.tenantTable === file.table)
        rows[name].push(...unsealed(o.seal, model, ownedIn(store, inFile, name, owner, id)))
  }).then(() => person)
}
