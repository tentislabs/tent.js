import { storedLimit } from './limits.ts'
import type { Opened } from './opened.ts'
import { systemWrite } from './systemWrite.ts'
import { isStored } from '../core/internal.ts'

const system = { as: { kind: 'system' } } as const

type Stored = Record<string, unknown>

/** What `lasts` of a table that stays says: how long, from which moment, and of which rows. */
interface Keep {
  table: string
  for: number
  by: string
  where?: Stored
}

/** The tables of an app that keep their rows for a time. */
function keptFor(o: Opened): Keep[] {
  return Object.entries(o.description.tables).flatMap(([table, record]) => {
    const keep = isStored(record.lasts) ? record.lasts : undefined
    if (typeof keep?.for !== 'number' || typeof keep.by !== 'string') return []
    return [{ table, for: keep.for, by: keep.by, ...(isStored(keep.where) ? { where: keep.where } : {}) }]
  })
}

/** The links of other tables that refuse the removal of a row of a table: a row they hold stays. */
function refusing(o: Opened, table: string): { table: string; column: string }[] {
  return Object.entries(o.description.tables).flatMap(([name, record]) =>
    Object.entries(isStored(record.columns) ? record.columns : {}).flatMap(([column, type]) =>
      isStored(type) && type.kind === 'link' && type.table === table && (type.onRemove ?? 'refuse') === 'refuse'
        ? [{ table: name, column }]
        : [],
    ),
  )
}

/** The rows a read answers, as a list. */
const rowsIn = (read: unknown): Stored[] => (Array.isArray(read) ? read.filter(isStored) : [])

/** The tenants whose files hold rows of a tenant table: every file of the table of its tenants. */
function tenantsOf(o: Opened, table: string): (string | undefined)[] {
  const columns = o.description.tables[table]?.columns
  const column = o.description.tables[table]?.tenant
  const by = isStored(columns) && typeof column === 'string' ? Reflect.get(Object(columns[column]), 'table') : undefined
  if (typeof by !== 'string') return [undefined]
  return [...(o.files?.walk() ?? [])].filter((file) => file.table === by).map((file) => file.id)
}

/**
 * Removes the rows of one table, of one file, that are past their time: a page of `limits.workPage` rows to a
 * write, each written as the system, so that each link's `onRemove` is followed and the triggers of a removal
 * start. A row that a link which refuses holds is left, and the log names it. Answers how many were removed, in
 * how many pages.
 */
async function removeOld(o: Opened, keep: Keep, of: string | undefined): Promise<{ removed: number; pages: number }> {
  const page = Math.max(1, storedLimit(o.description, 'workPage'))
  const before = new Date(o.clock.now() - keep.for)
  const old: Stored = { all: [{ col: keep.by, before }, ...(keep.where ? [keep.where] : [])] }
  const held = new Set<string>()
  const links = refusing(o, keep.table)
  let removed = 0
  let pages = 0
  for (;;) {
    const where: Stored = held.size ? { all: [old, { not: { col: 'id', in: [...held] } }] } : old
    const plan = { from: keep.table, ...(of ? { of } : {}), where, sort: [{ by: 'id' }], limit: page, pick: ['id'] }
    const ids = rowsIn(await o.app.read(plan, system)).map((row) => String(row.id))
    if (!ids.length) break
    const going: string[] = []
    for (const id of ids) {
      const by = []
      for (const link of links) {
        const count = await o.app.read({ from: link.table, where: { col: link.column, is: id }, count: true }, system)
        if (Number(count) > 0) by.push(`${link.table}.${link.column}`)
      }
      if (!by.length) going.push(id)
      else {
        held.add(id)
        o.log.write('lines', {
          at: o.clock.now(),
          level: 'info',
          message:
            'A row past the time its table keeps it stays: it is one that a link holds, which refuses its removal.',
          data: JSON.stringify({ table: keep.table, id, by: by.join(', '), ...(of ? { of } : {}) }),
        })
      }
    }
    if (!going.length) continue
    await systemWrite(o, `keep.${keep.table}`, (db) =>
      db.write(going.map((id) => ({ remove: keep.table, ...(of ? { of } : {}), id }))),
    )
    removed += going.length
    pages += 1
  }
  return { removed, pages }
}

/**
 * Takes what the engine holds of an app. Removes the rows of each table that states `keep` that are past their
 * age, in the shared file and in each tenant's file, a page at a time. In the mode `development` it removes
 * nothing, unless the app was opened with `keep`, as `tent dev --keep` opens it. The log says how many it removed.
 */
export async function removeAged(o: Opened): Promise<void> {
  if (o.mode === 'development' && o.keepRows !== true) return
  for (const keep of keptFor(o)) {
    let removed = 0
    let pages = 0
    for (const of of tenantsOf(o, keep.table)) {
      if (o.closed) return
      const done = await removeOld(o, keep, of)
      removed += done.removed
      pages += done.pages
    }
    if (removed)
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'info',
        message: 'Rows past the time their table keeps them were removed.',
        data: JSON.stringify({ table: keep.table, removed, pages }),
      })
  }
}
