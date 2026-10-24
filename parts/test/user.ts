import type { Caller } from '../core/index.ts'
import type { App } from '../engine/index.ts'
import { userCaller } from '../core/internal.ts'
import { withUsers } from './as.ts'

/**
 * `app.user(values)`: adds a row to `users` with those columns, as the system, and answers the caller that is
 * that user. Throws T0014 for an app with no `users` table.
 */
export const user =
  (app: App) =>
  async (values: Record<string, unknown> = {}): Promise<Caller> => {
    withUsers(app)
    const rows = await app.write([{ add: 'users', values }], { as: 'system' })
    const row: unknown = Array.isArray(rows) ? rows[0] : rows
    return userCaller(String(Reflect.get(Object(row), 'id')), row)
  }
