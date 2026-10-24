import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_oauth`: one row for each grant that a person gave a program. It holds the fingerprints of the access token
 * and of the renewal token, and of the renewal token before the present one, and nothing that opens them, so a copy
 * of the data makes nobody a caller.
 */
export const table: TableLayout = {
  name: '_t_oauth',
  columns: {
    id: { kind: 'text' },
    user: { kind: 'text' },
    client: { kind: 'text' },
    name: { kind: 'text' },
    resource: { kind: 'text' },
    scopes: { kind: 'json' },
    access: { kind: 'text' },
    refresh: { kind: 'text' },
    refreshBefore: { kind: 'text', optional: true },
    renewedAt: { kind: 'date', optional: true },
    reusedAt: { kind: 'date', optional: true },
    for: { kind: 'text' },
    accessExpiresAt: { kind: 'date' },
    createdAt: { kind: 'date' },
    usedAt: { kind: 'date' },
    expiresAt: { kind: 'date' },
  },
  key: ['id'],
  indexes: [['user']],
  unique: [],
  search: [],
}
