import type { Caller } from '../core/index.ts'
import type { App } from '../engine/index.ts'
import { writeKey } from '../engine/index.ts'

/** What `app.key` is handed: what the key carries, as `keys.add` takes it. */
export interface KeyAsked {
  scopes?: string[]
  roles?: string[]
  user?: string
  asks?: 'none'
  perMinute?: number
  for?: string
}

/**
 * `app.key({ scopes, roles, user, asks })`: makes a key, as the system does. Answers the caller that it is, for
 * `app.as(...)`, and the key itself, for a request.
 */
export const key =
  (app: () => App) =>
  async (o: KeyAsked = {}): Promise<{ caller: Caller; key: string }> => {
    const made = writeKey(app(), o)
    const base = { id: made.row.id, scopes: made.row.scopes }
    if (made.row.user === undefined)
      return { caller: { kind: 'key', key: { ...base, roles: made.row.roles } }, key: made.key }
    const row = await app().read({ from: 'users', one: 'get', id: made.row.user }, { as: 'system' })
    const roles = Reflect.get(Object(row), 'roles')
    const held = Array.isArray(roles) ? roles.map(String) : []
    return {
      caller: { kind: 'key', user: { id: made.row.user, roles: held }, key: { ...base, roles: held } },
      key: made.key,
    }
  }
