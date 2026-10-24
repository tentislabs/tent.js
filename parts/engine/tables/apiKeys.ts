import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_api_keys`: one row for each key of a program. It holds the fingerprint of the random part of the key and
 * nothing that opens it, so a copy of the data makes nobody a caller. `work` is for a key of the right `work`, and
 * `rights` for a key of publishing.
 */
export const table: TableLayout = {
  name: '_t_api_keys',
  columns: {
    id: { kind: 'text' },
    fingerprint: { kind: 'text' },
    name: { kind: 'text' },
    scopes: { kind: 'json' },
    roles: { kind: 'json' },
    user: { kind: 'text', optional: true },
    perMinute: { kind: 'number', whole: true },
    asks: { kind: 'text', optional: true },
    work: { kind: 'json', optional: true },
    rights: { kind: 'json', optional: true },
    createdAt: { kind: 'date' },
    lastUsedAt: { kind: 'date', optional: true },
    expiresAt: { kind: 'date', optional: true },
  },
  key: ['id'],
  indexes: [['user']],
  unique: [],
  search: [],
}
