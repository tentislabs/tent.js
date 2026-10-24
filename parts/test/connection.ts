import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { App } from '../engine/index.ts'
import { writeConnection } from '../engine/index.ts'

/**
 * `app.connection(user, service, { account })`: writes a connection of a user to a service whose sign-in is
 * `oauth`, as a connect would, so that a call of that user, or one that names them with `for`, has one. A faked
 * service still needs it. The user is the id of a row of `users`, or a caller that is one.
 */
export const connection =
  (app: () => App) =>
  async (user: string | Caller, service: string, o: { account?: string } = {}): Promise<void> => {
    const id = typeof user === 'string' ? user : user.user?.id
    if (id === undefined)
      throw new TentError('T0002', 'app.connection is handed a user, by its id or as a caller that is one.', {
        fix: 'Hand it the id of a user, or a caller of a user.',
      })
    writeConnection(app(), id, service, o.account ?? '')
  }
