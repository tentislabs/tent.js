import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_connections`: one row for each account of a user at a service whose sign-in is `oauth`, under the service,
 * the user and the name of the account, which is empty text for the one account of the simple case. `tokens` are
 * encrypted as a secret is, bound to the mode, the service and the user, so a row copied to another opens nothing.
 */
export const table: TableLayout = {
  name: '_t_connections',
  columns: {
    service: { kind: 'text' },
    user: { kind: 'text' },
    account: { kind: 'text' },
    tokens: { kind: 'text' },
    scopes: { kind: 'json' },
    expiresAt: { kind: 'date', optional: true },
    createdAt: { kind: 'date' },
    updatedAt: { kind: 'date' },
  },
  key: ['service', 'user', 'account'],
  indexes: [['user']],
  unique: [],
  search: [],
}
