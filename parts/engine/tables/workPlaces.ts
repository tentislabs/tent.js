import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_work_places`: each place under the limits of a service that the `may` of a worker took, by its task and the
 * id of the `may`, with the service and the version it was counted under: a writer that starts again takes them
 * again, so a `did` that arrives after it frees what it took, and no call passes `atOnce` meanwhile.
 */
export const table: TableLayout = {
  name: '_t_work_places',
  columns: {
    task: { kind: 'text' },
    may: { kind: 'text' },
    service: { kind: 'text' },
    version: { kind: 'text' },
    at: { kind: 'date' },
  },
  key: ['task', 'may'],
  indexes: [['task']],
  unique: [],
  search: [],
}
