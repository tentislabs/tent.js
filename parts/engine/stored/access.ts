import { callerText } from '../../data/index.ts'
import type { Caller } from '../../core/index.ts'
import { createDb } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { sealed } from '../values/seal.ts'
import type { StoredFile } from './files.ts'
import { visitorOwner } from './files.ts'
import { holdsOf } from './holds.ts'

/**
 * Calls a member of a table of a `db` by its name, and answers what it answers. For a tenant table
 * the tenant names the one file that is opened for it.
 */
function asked(db: object, tableName: string, member: string, id: string, tenant?: string): unknown {
  const whole: unknown = Reflect.get(db, tableName)
  const of: unknown = Reflect.get(Object(whole), 'of')
  const table: unknown = tenant !== undefined && typeof of === 'function' ? Reflect.apply(of, whole, [tenant]) : whole
  const call: unknown = Reflect.get(Object(table), member)
  return typeof call === 'function' ? Reflect.apply(call, table, [id]) : undefined
}

/**
 * The rule of a download: takes an app, a caller, a file, and the visitor id that the request of the caller
 * carries, if any. A file is the caller's to have when the caller may read a row that holds it, through a column
 * that is not `private`, or a kept earlier version of such a row; and a loose file when the caller is who it
 * belongs to, also as the visitor they were before they signed in. A caller that is the system has every file. A
 * removed file is nobody's. A file has no rule of its own: one that everyone may see is held by a row that
 * everyone may read.
 */
export function mayDownload(o: Opened, caller: Caller, file: StoredFile, visitor?: string): boolean {
  if (file.removedAt !== undefined) return false
  if (caller.kind === 'system') return true
  // A loose file that code made for a caller who is nobody, where no browser was answered, belongs to no one who
  // could be told apart again: nobody has it until a row holds it.
  if (file.looseAt !== undefined)
    return (
      file.by !== 'nobody' &&
      (file.by === callerText(caller) || (visitor !== undefined && file.by === visitorOwner(visitor)))
    )
  const db = createDb(o.files ?? o.store, o.description, caller, 'read', o.rules, {
    now: () => o.clock.now(),
    ...sealed(o),
  })
  for (const hold of holdsOf(o, file.id)) {
    const stored = Object.hasOwn(o.description.tables, hold.tableName)
      ? o.description.tables[hold.tableName]
      : undefined
    const column: unknown = Reflect.get(Object(stored?.columns), hold.column.split('.')[0])
    if (!stored || Reflect.get(Object(column), 'private') === true) continue
    try {
      // The row as it is now, under the rules of the caller: or what was kept of it, where the caller may read that.
      if (hold.keptAt === '' && asked(db, hold.tableName, 'get', hold.rowId, hold.of) !== undefined) return true
      const kept: unknown = hold.keptAt === '' ? undefined : asked(db, hold.tableName, 'history', hold.rowId, hold.of)
      if (Array.isArray(kept) && kept.length) return true
    } catch {
      // A row that the caller may not read, and one of a table that is gone, hands out no file.
    }
  }
  return false
}

/**
 * Whether a caller may put a file into a row: held tighter than a download. A caller puts in a file that it
 * uploaded itself, also as the visitor it was before it signed in, or one that a row it may change holds already:
 * one of a table whose rule for a change lets every such caller in, or whose owner it is. So a person's file never
 * comes to stand, by another's hand, in a row that person cannot read. A caller that is the system puts in any.
 */
export function mayPut(o: Opened, caller: Caller, file: StoredFile, visitor?: string): boolean {
  if (file.removedAt !== undefined) return false
  if (caller.kind === 'system') return true
  const own = file.by === callerText(caller) || (visitor !== undefined && file.by === visitorOwner(visitor))
  if (file.by !== 'nobody' && own) return true
  return holdsOf(o, file.id).some((hold) => hold.keptAt === '' && mayChangeRow(o, caller, hold))
}

/** Whether the rule of a table for a change lets a caller change one row that holds a file. */
function mayChangeRow(o: Opened, caller: Caller, hold: { tableName: string; rowId: string; of?: string }): boolean {
  const stored = Object.hasOwn(o.description.tables, hold.tableName) ? o.description.tables[hold.tableName] : undefined
  const change: unknown = Reflect.get(Object(stored?.access), 'change')
  const rule: unknown = Reflect.get(Object(change), 'rule')
  if (rule === 'anyone') return true
  if (rule === 'signedIn') return caller.user !== undefined || caller.kind === 'key' || caller.kind === 'mcp'
  if (rule === 'role')
    return (caller.key?.roles ?? caller.user?.roles ?? []).includes(String(Reflect.get(Object(change), 'role')))
  if (rule !== 'owner' || !caller.user) return false
  const column = hold.tableName === 'users' ? 'id' : String(stored?.owner)
  const db = createDb(o.files ?? o.store, o.description, { kind: 'system' }, 'read', o.rules, {
    now: () => o.clock.now(),
    ...sealed(o),
  })
  try {
    return Reflect.get(Object(asked(db, hold.tableName, 'get', hold.rowId, hold.of)), column) === caller.user.id
  } catch {
    return false
  }
}
