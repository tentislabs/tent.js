import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_attempts`: the count of the tries of each key, and of each key at each address, in the window that runs.
 * `address` holds nothing but an empty text where the count is kept for the key alone.
 */
export const table: TableLayout = {
  name: '_t_attempts',
  columns: {
    key: { kind: 'text' },
    address: { kind: 'text' },
    windowStart: { kind: 'date' },
    count: { kind: 'number', whole: true },
  },
  key: ['key', 'address'],
  indexes: [],
  unique: [],
  search: [],
}
