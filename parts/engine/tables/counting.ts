import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_counting`: what the counting itself keeps, by its key: under `level` the last measured size of the files and
 * of the data with the moment it was measured at, and under `batch:<machine id>` the batches of a reader.
 */
export const table: TableLayout = {
  name: '_t_counting',
  columns: {
    key: { kind: 'text' },
    value: { kind: 'json' },
  },
  key: ['key'],
  indexes: [],
  unique: [],
  search: [],
}
