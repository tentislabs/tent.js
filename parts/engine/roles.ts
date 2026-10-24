import { needsUsers, userCaller } from '../core/internal.ts'
import type { CallContext } from './context.ts'
import { systemWriteIn } from './systemWrite.ts'

/**
 * Takes the context of a call, the id of a user, and what makes the new list of roles from the one the row
 * holds. Writes the roles of that user, as a write of `users` like any other, and answers the list that stands.
 * Each role stands once. Throws T0014 with no `users` table, and T2103 for an id that names no row.
 */
export function writeRoles(cx: CallContext, user: unknown, make: (held: string[]) => string[]): string[] {
  const o = cx.app
  needsUsers({ name: o.name, tables: o.description.tables })
  const id = typeof user === 'string' ? user : String(Reflect.get(Object(user), 'id'))
  return systemWriteIn(cx, 'the handle `roles`', (db) => {
    const users = Object(Reflect.get(db, 'users'))
    const row: unknown = Reflect.apply(Reflect.get(users, 'get'), users, [id])
    const held = userCaller(id, row).user?.roles ?? []
    const next = [...new Set(make(held).map(String))]
    // A list that stays as it is writes nothing, so that no trigger fires for a role that was there.
    if (next.length !== held.length || next.some((role, at) => role !== held[at]))
      Reflect.apply(Reflect.get(users, 'change'), users, [id, { roles: next }])
    return next
  })
}
