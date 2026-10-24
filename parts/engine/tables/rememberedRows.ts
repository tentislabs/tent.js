import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_remembered_rows`: the rows that fed a remembered answer, in the shared file. A write that changes or removes
 * one removes that answer. `of` is the tenant, for a row of a tenant table.
 */
export const table: TableLayout = {
  name: '_t_remembered_rows',
  columns: {
    tableName: { kind: 'text' },
    rowId: { kind: 'text' },
    key: { kind: 'text' },
    of: { kind: 'text', optional: true },
  },
  key: ['tableName', 'rowId', 'key'],
  indexes: [['key'], ['of']],
  unique: [],
  search: [],
}
