import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_filled`, in the file of the row: one row for each value of a column that work fills. `read` is the
 * fingerprint of what the work was handed, and `work` that of what the value rests on beside the row; `state` is
 * `due`, `made` or `failed`. A row whose value a link reads stands under the column name `*`, with the mark of
 * the write that changed it in `read`, until the pass marked the rows that read it.
 */
export const table: TableLayout = {
  name: '_t_filled',
  columns: {
    tableName: { kind: 'text' },
    rowId: { kind: 'text' },
    columnName: { kind: 'text' },
    read: { kind: 'text', optional: true },
    work: { kind: 'text', optional: true },
    state: { kind: 'text' },
    dueAt: { kind: 'date', optional: true },
    tries: { kind: 'number', whole: true },
    error: { kind: 'json', optional: true },
    madeAt: { kind: 'date', optional: true },
  },
  key: ['tableName', 'rowId', 'columnName'],
  indexes: [
    ['state', 'dueAt'],
    ['tableName', 'columnName'],
  ],
  unique: [],
  search: [],
}
