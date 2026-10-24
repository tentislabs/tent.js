import { callOf } from '../handleCall.ts'
import type { Opened } from '../opened.ts'
import { writeRoles } from '../roles.ts'

/** The roles of a user are written with full access, and a read writes none. */
const asks = { acts: true, full: 'gives and takes roles' }

/**
 * The working object behind the handle `roles`: the one way, beside `db.system`, by which the `roles` of a user
 * are written. It is full access, and each write of it is a write of `users` like any other.
 */
export const handle = (_o: Opened): object => ({
  add: (user: unknown, role: unknown): void =>
    void writeRoles(callOf('`roles.add`', asks), user, (held) => [...held, String(role)]),
  remove: (user: unknown, role: unknown): void =>
    void writeRoles(callOf('`roles.remove`', asks), user, (held) => held.filter((one) => one !== String(role))),
  set: (user: unknown, list: unknown): void =>
    void writeRoles(callOf('`roles.set`', asks), user, () => (Array.isArray(list) ? list.map(String) : [])),
})
