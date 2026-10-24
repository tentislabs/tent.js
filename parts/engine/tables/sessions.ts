import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_sessions`: one row for each session, under the fingerprint of the bytes of its cookie. `life` is its own
 * life in milliseconds, where it was started with another than `sessionTime`, and `browserOnly` is 0 or 1.
 */
export const table: TableLayout = {
  name: '_t_sessions',
  columns: {
    fingerprint: { kind: 'text' },
    user: { kind: 'text' },
    createdAt: { kind: 'date' },
    usedAt: { kind: 'date' },
    expiresAt: { kind: 'date' },
    life: { kind: 'number', whole: true, optional: true },
    browserOnly: { kind: 'number', whole: true },
  },
  key: ['fingerprint'],
  indexes: [['user']],
  unique: [],
  search: [],
}
