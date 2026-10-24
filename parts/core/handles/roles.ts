import { member } from '../handle.ts'

/** The handle of the roles of a user. Every member answers at once. */
interface Roles {
  add(user: string, role: string): void
  remove(user: string, role: string): void
  set(user: string, roles: readonly string[]): void
}

export const roles: Roles = {
  add: member('roles', 'add'),
  remove: member('roles', 'remove'),
  set: member('roles', 'set'),
}
