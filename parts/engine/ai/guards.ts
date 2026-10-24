import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { FileName } from '../../data/index.ts'
import type { CallContext } from '../context.ts'
import type { Opened } from '../opened.ts'
import { dbFor } from '../program.ts'
import { filesReadBy } from './runFiles.ts'
import { isStored } from '../../core/internal.ts'

const system: Caller = { kind: 'system' }

// The outside id of a row: 26 characters of the alphabet that ids are written in, standing apart.
const rowId = /(?<![0-9a-z])[0-9abcdefghjkmnpqrstvwxyz]{26}(?![0-9a-z])/g

// A value shorter than this is no value that an answer can be held to name: too many words are as short.
const shortest = 4

/** A table whose rows a guard looks at, and the file it looks in: the shared file, or the file of one tenant. */
interface Place {
  table: string
  stored: Record<string, unknown>
  file?: FileName
}

/** The table of the tenants of a tenant table: the table its `tenant` column links to. */
function tenantTable(stored: Record<string, unknown>): string | undefined {
  if (typeof stored.tenant !== 'string') return undefined
  const linked: unknown = Reflect.get(Object(Reflect.get(Object(stored.columns), stored.tenant)), 'table')
  return typeof linked === 'string' ? linked : undefined
}

/**
 * The places whose rows a guard looks at: each table of the shared file that holds rows of its own, and each tenant
 * table in the file of each tenant that the run read.
 */
function placesOf(o: Opened, run: string | undefined): Place[] {
  const files = run ? filesReadBy(o, run) : []
  return Object.entries(o.description.tables).flatMap(([table, stored]): Place[] => {
    if (stored.shows !== undefined) return []
    const by = tenantTable(stored)
    if (stored.tenant === undefined) return [{ table, stored }]
    return files.filter((file) => file.table === by).map((file) => ({ table, stored, file }))
  })
}

/** Calls a member of a value by its name, as a `db` of the engine gives one. */
const member = (value: unknown, name: string, args: unknown[]): unknown =>
  Reflect.apply(Object(Reflect.get(Object(value), name)), value, args)

/** The ids among `ids` of rows of a place that a caller may read, under the table's rule, in the file of the place. */
function readable(o: Opened, caller: Caller, place: Place, ids: string[]): Set<string> {
  const table: unknown = Reflect.get(Object(dbFor(o, caller)), place.table)
  const of = place.file ? member(table, 'of', [place.file.id]) : table
  const rows: unknown = member(member(of, 'where', [{ id: { in: ids } }]), 'all', [])
  return new Set((Array.isArray(rows) ? rows : []).map((row) => String(Reflect.get(Object(row), 'id'))))
}

/**
 * `noOtherPeople`: every id of a row that the text names is held against what the caller may read, in the shared
 * file and in the files of tenants the run read. Answers why it does not pass where it names a row of the app that
 * the caller may not read; an id of no row passes.
 */
function otherPeople(o: Opened, caller: Caller, text: string, run?: string): string | undefined {
  const ids = [...new Set(text.match(rowId) ?? [])]
  if (!ids.length || caller.kind === 'system') return undefined
  for (const place of placesOf(o, run)) {
    const there = [...readable(o, system, place, ids)]
    if (!there.length) continue
    const theirs = readable(o, caller, place, there)
    if (there.some((id) => !theirs.has(id))) return `it names a row of ${place.table} that the starter may not read`
  }
  return undefined
}

/** The columns of a table marked personal or private that a text can name, each with its kind and its mark. */
function markedColumns(table: Record<string, unknown>): { name: string; kind: string; private: boolean }[] {
  const columns = isStored(table.columns) ? table.columns : {}
  return Object.entries(columns).flatMap(([name, column]) => {
    if (!isStored(column) || column.sealed === true) return []
    if (column.private !== true && column.personal !== true) return []
    // A yes or a no, bytes, a vector, a link and a file hold nothing that a text names as their value.
    if (['boolean', 'bytes', 'vector', 'link', 'file'].includes(String(column.kind))) return []
    return [{ name, kind: String(column.kind), private: column.private === true }]
  })
}

/** A column as SQLite keeps it, as the text an answer writes it in: a moment as its day, a number as its digits. */
function valueText(column: string, kind: string): string {
  if (kind === 'date') return `date(${column} / 1000.0, 'unixepoch')`
  return `CAST(${column} AS TEXT)`
}

/**
 * The ids of the rows of a place whose column holds a value that the text holds, without regard to capitals. A
 * list, a record and a `json` hold each of their values.
 */
function rowsNamed(o: Opened, place: Place, column: { name: string; kind: string }, text: string): string[] {
  const store = place.file ? o.files?.of(place.file) : o.store
  if (!store?.sql) return []
  const name = (part: string): string => `"${part.replaceAll('"', '""')}"`
  const where = ['list', 'object', 'json'].includes(column.kind)
    ? `EXISTS (SELECT 1 FROM json_tree(${name(column.name)}) WHERE "type" IN ('text', 'integer', 'real') AND length(CAST("atom" AS TEXT)) >= ? AND instr(lower(?), lower(CAST("atom" AS TEXT))) > 0)`
    : `${name(column.name)} IS NOT NULL AND length(${valueText(name(column.name), column.kind)}) >= ? AND instr(lower(?), lower(${valueText(name(column.name), column.kind)})) > 0`
  const rows = store.sql(`SELECT "id" FROM ${name(place.table)} WHERE ${where}`, [shortest, text])
  return rows.map((row) => String(Reflect.get(Object(row), 'id')))
}

/**
 * `noPersonal`: answers why the text does not pass where it holds the value of a column marked `personal` of a
 * row the caller may not read, or the value of a column marked `private`, which never leaves the server in a row:
 * of any type a text can name, in the shared file and in the files of tenants the run read.
 */
function personal(o: Opened, caller: Caller, text: string, run?: string): string | undefined {
  if (caller.kind === 'system') return undefined
  for (const place of placesOf(o, run))
    for (const column of markedColumns(place.stored)) {
      const named = rowsNamed(o, place, column, text)
      if (!named.length) continue
      if (column.private) return `it holds a private value of ${place.table}`
      const theirs = readable(o, caller, place, named)
      if (named.some((id) => !theirs.has(id)))
        return `it holds a personal value of ${place.table} that the starter may not read`
    }
  return undefined
}

/**
 * `_t_guard({ guard, text })`: a guard of the engine's own, carried out for the caller of the call under way, who is
 * the starter of the run. Answers `{ pass }`, with `why` where it does not pass. Throws T0001 for no such guard.
 */
export function ownGuard(cx: CallContext, given: unknown): { pass: boolean; why?: string } {
  const asked: Record<string, unknown> = isStored(given) ? given : {}
  const text = typeof asked.text === 'string' ? asked.text : ''
  const check = asked.guard === 'noOtherPeople' ? otherPeople : asked.guard === 'noPersonal' ? personal : undefined
  if (!check) throw new TentError('T0001', `No guard ${JSON.stringify(asked.guard)} is the engine's own.`)
  const why = check(cx.app, cx.caller, text, cx.run?.id)
  return why === undefined ? { pass: true } : { pass: false, why }
}
