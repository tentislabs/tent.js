import type { Stored } from '../record.ts'
import type { Told } from './shared.ts'
import { code, known, report, required, setField, wasOf } from './shared.ts'

/** The options of `backfill`. */
const backfillOptions = ['table', 'run', 'page', 'fills', 'system', 'was']

/**
 * Takes the options of `backfill` as they were written. Answers the record of the backfill as it is stored: the
 * table by its name, the `run` as the code of its module, and `was` as a list. Reports a `page` that is no whole
 * number over 0, and a `fills` or a `system` that is no text, with T1014.
 */
export function backfillOf(told: Told, o: Stored): Stored {
  known(told, 'backfill', o, backfillOptions)
  required(told, 'backfill', o, ['table', 'run'])
  const stored: Stored = {}
  const table = typeof o.table === 'string' ? o.table : Reflect.get(Object(o.table), 'definition')
  if (typeof table !== 'string')
    report(told, 'T1014', '`table` names no table.', 'Hand it the table that the backfill walks.')
  setField(stored, 'table', table)
  if (typeof o.run !== 'function')
    report(told, 'T1014', '`run` is no function.', 'Write `run: (row, { db }) => ...`, which is handed each row.')
  stored.run = code(`${told.name}_run`)
  if (o.page !== undefined && (typeof o.page !== 'number' || !Number.isInteger(o.page) || o.page < 1))
    report(told, 'T1014', '`page` is no whole number over 0.', 'Write how many rows one write takes, as `page: 500`.')
  setField(stored, 'page', o.page)
  for (const name of ['fills', 'system'] as const) {
    if (o[name] !== undefined && typeof o[name] !== 'string')
      report(told, 'T1014', `\`${name}\` is no text.`, `Write \`${name}\` as text.`)
    setField(stored, name, o[name])
  }
  setField(stored, 'was', wasOf(o.was))
  return stored
}
