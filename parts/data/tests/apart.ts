import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import type { Caller, Db, Type } from '../../core/index.ts'
import { caller, choice, link, list, number, project, role, table, text, vector, where } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Files, FileName, Row, Store, TableLayout, TableStep } from '../index.ts'
import {
  applySteps,
  changesTable,
  createDb,
  hereTable,
  historyTable,
  layoutOf,
  openFiles,
  planTableChanges,
  sqliteStore,
} from '../index.ts'
import { at, described, seal } from './shop.ts'
import { system, workFolder } from './work.ts'

/** What a test changes of the app: each is one table change of the tenant tables. */
export interface AppChange {
  // A new optional column on `orders` and on `tasks`.
  ref?: boolean
  // `note` of `orders` must hold a value.
  noteRequired?: boolean
  // No two orders of one tenant share a `code`.
  codeUnique?: boolean
  // `note` of `orders` goes on as `remark`.
  renamed?: boolean
  // `code` of `orders` is removed.
  dropped?: boolean
  // `text` of `notes` is sealed.
  sealedText?: boolean
  // The table of the teams goes on as `groups`.
  groups?: boolean
  // `tasks` states no `tenant`: its rows live in the shared file.
  tasksShared?: boolean
}

/** The members of the teams, where the table of the teams has the name it is handed. */
const membersOf = (teams: string) =>
  table('members', {
    columns: { team: link(teams, { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
    access: { read: 'signedIn', add: role('admin') },
  })

// A row of a tenant table is reached by the members of its team: a rule through a table of the shared file.
const mine = where({
  team: {
    in: membersOf('teams')
      .where({ user: caller('id') })
      .pick(['team']),
  },
})
const byMembers = { read: mine, add: mine, change: mine, remove: mine }

/**
 * An app that keeps a data file for each team. `users`, `teams` and `members` live in the shared file. `orders`,
 * `lines`, `notes`, `payments` and `tasks` are tenant tables, with the team as the tenant: a member reads and writes the rows of their
 * teams, and a line is read by who may read its order, while the order is open.
 */
export function appOf(o: AppChange = {}): Description {
  const teams = o.groups ? 'groups' : 'teams'
  const team = () => link(teams, { onRemove: 'remove' })
  // A test changes which columns the table has, so their names are no part of the type of the table.
  const columns: Record<string, Type> = {
    team: team(),
    placedBy: link('users', { optional: true, onRemove: 'clear' }),
    total: number(),
    status: choice(['open', 'paid'], { default: 'open' }),
    ...(o.renamed
      ? { remark: text({ optional: true, was: 'note' }) }
      : { note: o.noteRequired ? text() : text({ optional: true }) }),
    ...(o.dropped ? {} : { code: text({ optional: true }) }),
    ...(o.ref ? { ref: text({ optional: true }) } : {}),
    meaning: vector({ size: 4 }),
  }
  const orders = table('orders', {
    columns,
    tenant: 'team',
    access: byMembers,
    search: [o.renamed ? 'remark' : 'note'],
    keepHistory: true,
    ...(o.codeUnique ? { unique: [['code']] } : {}),
    ...(o.dropped ? { removed: ['code'] } : {}),
  })
  return described([
    project('desk', {}),
    table('users', {
      columns: { name: text(), roles: list(text()) },
      access: { read: 'owner', add: role('admin'), change: 'owner', remove: role('admin') },
    }),
    table(teams, {
      columns: { name: text() },
      ...(o.groups ? { was: 'teams' } : {}),
      access: { read: 'signedIn', add: role('admin'), change: role('admin'), remove: role('admin') },
    }),
    membersOf(teams),
    orders,
    table('lines', {
      columns: { team: team(), order: link('orders', { onRemove: 'remove' }), qty: number() },
      tenant: 'team',
      // Written without `of`: the plan is read in the file that the rule is applied in.
      access: {
        ...byMembers,
        read: where({ order: { in: orders.where({ status: 'open' }).pick(['id']) } }),
      },
    }),
    table('notes', {
      columns: {
        team: team(),
        author: link('users', { onRemove: 'remove' }),
        text: o.sealedText ? text({ sealed: true }) : text(),
      },
      tenant: 'team',
      owner: 'author',
      access: byMembers,
      keepHistory: true,
    }),
    table('payments', {
      columns: { team: team(), order: link('orders', { optional: true, onRemove: 'clear' }), amount: number() },
      tenant: 'team',
      access: byMembers,
    }),
    table('tasks', {
      columns: { team: team(), title: text(), ...(o.ref ? { ref: text({ optional: true }) } : {}) },
      ...(o.tasksShared ? {} : { tenant: 'team' }),
      access: byMembers,
    }),
  ])
}

/** The tables of a description that live in the shared file, and the tenant tables. */
const sharedOf = (description: Description): TableLayout[] =>
  layoutOf(description).filter((one) => one.tenant === undefined)
const tenantLayouts = (description: Description): TableLayout[] =>
  layoutOf(description).filter((one) => one.tenant !== undefined)

/** The file of one team. */
export const teamFile = (id: string): FileName => ({ table: 'teams', id })

/** The tables of the engine that a shared file holds: the history of rows, and a machine's own. */
const engineTables: TableLayout[] = [historyTable, hereTable, changesTable]

// The files that a test opened on each of its folders: each is closed before its folder is removed.
const openIn = new Map<string, Files[]>()

/** Makes an empty folder for the files of one test. What the test opens there is closed before the folder is removed. */
export function folderOf(t: TestContext): string {
  const opened: Files[] = []
  // The runner calls what a test registered in the order it was registered: the closing comes before the removal.
  t.after(() => {
    for (const files of opened) closeAll(files)
  })
  const folder = workFolder(t)
  openIn.set(folder, opened)
  return folder
}

/** What `openFiles` takes last, but for the maker of a store. */
type FilesOptions = Omit<Parameters<typeof openFiles>[2], 'store'>

/**
 * Opens the files of an app on a folder of the test, with the shared tables of a description made in the shared
 * file, as a start makes them. Every file is closed when the test ends.
 */
export function filesOf(t: TestContext, description: Description, o: FilesOptions = {}, folder = folderOf(t)): Files {
  const files = openFiles(folder, layoutOf(description), { store: sqliteStore, ...o })
  openIn.get(folder)?.push(files)
  if (!files.shared.layout().some((one) => one.name === 'teams')) {
    const steps: TableStep[] = [...sharedOf(description), ...engineTables].map((layout) => ({
      do: 'addTable',
      table: layout.name,
      layout,
    }))
    files.write((w) => applySteps(w.tx(), files.shared, steps), { steps: true })
  }
  return files
}

/** Closes every tenant's file that is open, and the shared file. */
function closeAll(files: Files): void {
  for (const file of files.open()) files.close(file)
  try {
    files.shared.close()
  } catch {
    // The test closed it already.
  }
}

/** The steps that lead the tenant tables from one description to another, with nothing found. */
export function tenantSteps(from: Description, to: Description): TableStep[] {
  const { steps, findings } = planTableChanges(tenantLayouts(from), tenantLayouts(to))
  assert.deepEqual(findings, [])
  return steps
}

type DbOptions = Parameters<typeof createDb>[5]

/** Answers a function that carries out one write of the files as a caller, with a `db` of that write. */
export function writingFiles(files: Files, description: Description, who: Caller = system, o: DbOptions = {}) {
  return <T>(work: (db: Db) => T): T =>
    files.write((w) => work(createDb(w, description, who, 'write', {}, { seal, ...o }))).value
}

/** Answers a `db` that reads the files as a caller, at once. */
export const readingFiles = (files: Files, description: Description, who: Caller = system, o: DbOptions = {}): Db =>
  createDb(files, description, who, 'read', {}, { seal, ...o })

/** The value that `_t_meta` of a store holds under a key. */
export function metaOf(store: Store, key: string): unknown {
  const row = store.read({ from: '_t_meta', one: 'get', id: key }, system).value
  return typeof row === 'object' && !Array.isArray(row) ? row.value : undefined
}

/** The names of the tables of the app that a store holds. */
export const appTablesOf = (store: Store | undefined): string[] =>
  (store?.layout() ?? [])
    .map((one) => one.name)
    .filter((name) => !name.startsWith('_t_'))
    .sort()

/** Every row of a table of a store, as the store holds it, or none where the store does not hold the table. */
export function storedIn(store: Store | undefined, name: string): Row[] {
  if (!store?.layout().some((one) => one.name === name)) return []
  const rows = store.read({ from: name }, system).value
  const all = Array.isArray(rows) ? rows : []
  return name === '_t_meta' ? all.sort((a, b) => (String(a.key) < String(b.key) ? -1 : 1)) : all
}

/** What a store holds of the tables a record covers, table by table, with the vectors as they are stored. */
export function heldIn(store: Store | undefined): Record<string, unknown> {
  const all: Record<string, unknown> = {}
  for (const layout of (store?.layout() ?? []).filter((one) => !one.own)) {
    all[layout.name] = layout.retired ? 'retired' : storedIn(store, layout.name)
    for (const [column, type] of Object.entries(layout.columns))
      if (type.kind === 'vector')
        all[`${layout.name}__${column}`] = (
          store?.sql?.(
            `SELECT "t"."id", hex("v"."v") AS "v" FROM "${layout.name}__${column}" AS "v" JOIN "${layout.name}" AS "t" ON "t"."_n" = "v"."_n" ORDER BY "t"."id"`,
            [],
          ) ?? []
        ).map((row) => ({ ...Object(row) }))
  }
  return all
}

/** The running fingerprint that a store holds, or nothing where it holds none. */
export function sumOf(store: Store | undefined): unknown {
  const [row] = storedIn(store, '_t_here').filter((one) => one.key === 'sum')
  return row?.value
}

/**
 * Holds a second set of files against the first: the same files stand on the disk, each file and the shared file
 * hold the same rows of every table a record covers and the same running fingerprint, and the kept changes are
 * the same.
 */
export function sameFiles(first: Files, second: Files, what = ''): void {
  const names = (files: Files) => [...files.walk()].map((file) => `${file.table} ${file.id}`).sort()
  assert.deepEqual(names(second), names(first), `${what}: the files on the disk`)
  for (const file of first.walk()) {
    const [mine, theirs] = [first.of(file), second.of(file)]
    assert.deepEqual(heldIn(theirs), heldIn(mine), `${what}: the file of ${file.id}`)
    assert.equal(sumOf(theirs), sumOf(mine), `${what}: the running fingerprint of ${file.id}`)
  }
  assert.deepEqual(heldIn(second.shared), heldIn(first.shared), `${what}: the shared file`)
  assert.equal(sumOf(second.shared), sumOf(first.shared), `${what}: the running fingerprint of the shared file`)
  const kept = (files: Files) =>
    storedIn(files.shared, changesTable.name).map(({ record, ...row }) => ({ ...row, record: Object(record).length }))
  assert.deepEqual(kept(second), kept(first), `${what}: the kept changes`)
}

/** A signed-in caller with an id and roles. */
export const person = (id: string, roles: string[] = []): Caller => ({ kind: 'user', user: { id, roles } })

/**
 * Adds the people and the teams of the desk, as the system: Ada is a member of North, Bob of South, and Cy of no
 * team. East and West have no member. No row of a tenant table is written, so no tenant has a file. Answers
 * the id of each.
 */
export function seedDesk(files: Files, description: Description) {
  return writingFiles(
    files,
    description,
  )((db) => {
    const add = (name: string, values: Row) => String(at(db, name).add(values).id)
    const [ada, bob, cy] = ['Ada', 'Bob', 'Cy'].map((name) => add('users', { name }))
    const [north, south, east, west] = ['North', 'South', 'East', 'West'].map((name) => add('teams', { name }))
    add('members', { team: north, user: ada })
    add('members', { team: south, user: bob })
    return { ada, bob, cy, north, south, east, west }
  })
}
