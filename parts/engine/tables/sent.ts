import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_sent`: one row for each event that was emitted in a file while a run of another file waited for an event
 * of its name. A row is written in the write that emits, and removed once the event was handed to the other
 * files.
 */
export const table: TableLayout = {
  name: '_t_sent',
  columns: {
    id: { kind: 'text' },
    event: { kind: 'text' },
    data: { kind: 'json', optional: true },
    at: { kind: 'date' },
  },
  key: ['id'],
  indexes: [],
  unique: [],
  search: [],
}
