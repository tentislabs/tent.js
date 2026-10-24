import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_remembered`: the remembered answers, in the shared file. `key` is the fingerprint the answer was made under,
 * `caller` is empty for an answer that is shared, and `reads` holds what the work read, each with the fingerprint
 * of what it answered.
 */
export const table: TableLayout = {
  name: '_t_remembered',
  columns: {
    key: { kind: 'text' },
    definition: { kind: 'text' },
    caller: { kind: 'text', optional: true },
    answer: { kind: 'json', optional: true },
    files: { kind: 'json', optional: true },
    reads: { kind: 'json', optional: true },
    size: { kind: 'number', whole: true },
    madeAt: { kind: 'date' },
    givenAt: { kind: 'date' },
    endsAt: { kind: 'date' },
  },
  key: ['key'],
  indexes: [['endsAt'], ['givenAt'], ['caller']],
  unique: [],
  search: [],
}
