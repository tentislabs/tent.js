import type { Caller } from '../core/index.ts'
import type { App, GrantGiven } from '../engine/index.ts'
import { writeGrant } from '../engine/index.ts'

/**
 * `app.grant({ user, scopes, client })`: makes a grant, as a person who allowed a program would. Answers its id,
 * the caller that it is, for `app.as(...)`, and its access token, for a request of `/mcp`.
 */
export const grant =
  (app: () => App) =>
  async (o: GrantGiven): Promise<{ id: string; caller: Caller; token: string }> =>
    writeGrant(app(), o)
