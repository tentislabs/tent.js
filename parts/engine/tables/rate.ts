import type { TableLayout } from '../../data/index.ts'

/** `_t_rate`: the count of each caller and address in the minute that runs. A table of this machine alone. */
export const table: TableLayout = {
  name: '_t_rate',
  columns: { key: { kind: 'text' }, windowStart: { kind: 'date' }, count: { kind: 'number', whole: true } },
  key: ['key'],
  indexes: [],
  unique: [],
  search: [],
  own: true,
}
