import type { Caller } from './caller.ts'
import { TentError } from './errors.ts'

/** Holds an app to having a table of users, for whoever names a user by an id. Throws T0014 for one that has none. */
export function needsUsers(app: { name: string; tables: object }): void {
  if (!Object.hasOwn(app.tables, 'users'))
    throw new TentError('T0014', `A user is needed, and the app ${app.name} has no \`users\` table.`, {
      fix: 'Add a table named `users` to the project, or name `nobody` or `system`.',
    })
}

/**
 * Takes the id of a user that was named, and what `users` holds under it. Answers the caller that is that user,
 * with the roles the row holds. Throws T2103 for an id that names no row.
 */
export function userCaller(id: string, row: unknown): Caller {
  if (typeof row !== 'object' || row === null || Array.isArray(row))
    throw new TentError('T2103', `No row of \`users\` has the id ${JSON.stringify(id).slice(0, 60)}.`, {
      fix: 'Name the id of a user, or `nobody` or `system`.',
    })
  const roles: unknown = Reflect.get(row, 'roles')
  return {
    kind: 'user',
    user: { id: String(Reflect.get(row, 'id')), roles: Array.isArray(roles) ? roles.map(String) : [] },
  }
}
