import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_files`: one row for each upload, and for each file that code made. `by` is who it belongs to, as a column
 * keeps a caller. `address` is that of a caller who is nobody, for the count of their loose bytes. `looseAt` is
 * since when no row holds the file, and `removedAt` since when it is removed: the row and the bytes stay a while.
 * Its `id` has the form of the id of a row, and the store keeps it with `createdAt`, as for a table of an app.
 */
export const table: TableLayout = {
  name: '_t_files',
  columns: {
    fingerprint: { kind: 'text' },
    size: { kind: 'number', whole: true },
    kind: { kind: 'text' },
    name: { kind: 'text' },
    width: { kind: 'number', whole: true, optional: true },
    height: { kind: 'number', whole: true, optional: true },
    by: { kind: 'text' },
    address: { kind: 'text', optional: true },
    run: { kind: 'text', optional: true },
    looseAt: { kind: 'date', optional: true },
    removedAt: { kind: 'date', optional: true },
    tiny: { kind: 'text', optional: true },
  },
  indexes: [['by'], ['fingerprint']],
  unique: [],
  search: [],
}
