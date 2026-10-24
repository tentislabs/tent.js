import type { TableLayout } from './store.ts'

/**
 * `_t_meta`: what a data file says of itself, a value under each key. The store keeps the layout of each table of
 * the file there, one row for each.
 */
export const metaTable: TableLayout = {
  name: '_t_meta',
  columns: { key: { kind: 'text' }, value: { kind: 'json', optional: true } },
  key: ['key'],
  indexes: [],
  unique: [],
  search: [],
}

/**
 * `_t_here`: what this machine alone holds, a value under each key. No record of a commit covers it, and each
 * machine writes its own.
 */
export const hereTable: TableLayout = {
  name: '_t_here',
  columns: { key: { kind: 'text' }, value: { kind: 'json', optional: true } },
  key: ['key'],
  indexes: [],
  unique: [],
  search: [],
  own: true,
}

/**
 * `_t_changes`: the newest changes this machine keeps for its readers, each with its number, its epoch, its
 * running fingerprint, the change without its record, and the record as raw bytes. A machine's own, as `_t_here` is.
 */
export const changesTable: TableLayout = {
  name: '_t_changes',
  columns: {
    n: { kind: 'number', whole: true },
    epoch: { kind: 'text' },
    sum: { kind: 'text' },
    change: { kind: 'json' },
    record: { kind: 'bytes' },
  },
  key: ['n'],
  indexes: [],
  unique: [],
  search: [],
  own: true,
}

/**
 * `_t_history`: each earlier version of a row of a table that keeps its history, with who changed it and when. The
 * value is the row before the change, as app code sees it, a sealed value sealed.
 */
export const historyTable: TableLayout = {
  name: '_t_history',
  columns: {
    id: { kind: 'text' },
    tableName: { kind: 'text' },
    rowId: { kind: 'text' },
    at: { kind: 'date' },
    by: { kind: 'text' },
    value: { kind: 'json' },
  },
  key: ['id'],
  indexes: [['tableName', 'rowId']],
  unique: [],
  search: [],
}
