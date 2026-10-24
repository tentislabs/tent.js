import { needsUsers, userCaller } from '../../core/internal.ts'
import type { Admin } from '../admin.ts'
import { badWord, wordOf } from '../admin.ts'

/**
 * `tent access role add <user id> <role>` and `tent access role remove <user id> <role>`: gives a user a role, or
 * takes one away, as the handle `roles` does, with a write of `users` like any other. On a reader the write is
 * the writer's. It answers the user and the roles that stand. Throws T0014 with no `users` table, and T2103 for
 * an id that names no row.
 */
export const admin: Admin = {
  name: 'access-role',
  async run(o, args) {
    const act = wordOf(args, 'do', '`add` or `remove`')
    if (act !== 'add' && act !== 'remove') throw badWord('do', '`add` or `remove`')
    const user = wordOf(args, 'user', 'the id of a user')
    const role = wordOf(args, 'role', 'the name of a role')
    needsUsers({ name: o.name, tables: o.description.tables })
    const row = await o.app.read({ from: 'users', one: 'get', id: user }, { as: 'system' })
    const held = userCaller(user, row).user?.roles ?? []
    const roles = act === 'add' ? [...new Set([...held, role])] : held.filter((one) => one !== role)
    if (roles.length !== held.length)
      await o.app.write([{ change: 'users', id: user, values: { roles } }], { as: 'system' })
    return { user, roles }
  },
}
