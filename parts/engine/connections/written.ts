import { TentError } from '../../core/index.ts'
import type { App } from '../app.ts'
import { openedOf } from '../app.ts'
import { heldOpen } from '../opened.ts'
import { writeTokens } from './kept.ts'
import { isStored } from '../../core/internal.ts'

/**
 * Takes an app, a user, a service whose auth is `oauth`, and the name of an account. Writes a connection of that
 * user, as a connect would, with tokens of a test that end in a day and the scopes the service asks for: it is how
 * `app.connection` of the test helpers stands in for the provider. Throws T0013 for a service with no `oauth`, or an
 * app that is closed.
 */
export function writeConnection(app: App, user: string, service: string, account = ''): void {
  const o = openedOf(app)
  if (!o) throw new TentError('T0013', 'A connection is written into an app that an engine opened.')
  heldOpen(o)
  const stored = Object.hasOwn(o.description.services, service) ? o.description.services[service] : undefined
  const oauth = isStored(stored?.auth) && isStored(stored.auth.oauth) ? stored.auth.oauth : undefined
  if (!oauth)
    throw new TentError('T0013', `${service} is no service of the app whose auth is \`oauth\`.`, {
      fix: 'Name a service whose auth is `oauth`.',
    })
  const scopes = Array.isArray(oauth.scopes) ? oauth.scopes.map(String) : []
  writeTokens(
    o,
    { service, user, account },
    {
      access: `test-access-${service}-${user}`,
      refresh: `test-refresh-${service}-${user}`,
      expiresAt: o.clock.now() + 86_400_000,
      scopes,
    },
  )
}
