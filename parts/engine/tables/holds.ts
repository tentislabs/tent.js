import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_holds`: one row for each row of the app that holds a file, and for each kept earlier version of a row, with
 * the time of that version in `keptAt`, which is an empty text for the row as it is now. `of` is the tenant, for a
 * row of a tenant table.
 */
export const table: TableLayout = {
  name: '_t_holds',
  columns: {
    file: { kind: 'text' },
    tableName: { kind: 'text' },
    rowId: { kind: 'text' },
    column: { kind: 'text' },
    keptAt: { kind: 'text' },
    of: { kind: 'text', optional: true },
  },
  key: ['file', 'tableName', 'rowId', 'column', 'keptAt'],
  indexes: [['tableName', 'rowId']],
  unique: [],
  search: [],
}
