import type { TableLayout } from '../../data/index.ts'

/**
 * `_t_once`: the one table of what was done once, each row by its caller and its key, with what it answered. A call
 * inside a step, under the caller `''` and its once-only key, with the places counted inside it, kept as long as
 * its run; a call of a page or of a caller outside by the id it carried, kept for `limits.callIdKeep`; and a call
 * coming in, under `incoming:<name>` and the id of its scheme, kept for `limits.incomingKept`.
 */
export const table: TableLayout = {
  name: '_t_once',
  columns: {
    caller: { kind: 'text' },
    key: { kind: 'text' },
    run: { kind: 'text' },
    at: { kind: 'date' },
    result: { kind: 'json', optional: true },
    places: { kind: 'json', optional: true },
  },
  key: ['caller', 'key'],
  indexes: [['run'], ['at']],
  unique: [],
  search: [],
}

/** The key of the row of a call inside a step, which no caller of its own holds. */
export const stepKey = (key: string): { caller: string; key: string } => ({ caller: '', key })
