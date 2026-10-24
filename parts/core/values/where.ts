import type { User } from '../caller.ts'
import type { QueryDb } from '../db.ts'
import { filterOf } from '../filter.ts'
import type { WhereRule } from '../helpers/rules.ts'
import { whereRule } from '../helpers/whereRule.ts'
import { matches } from '../matches.ts'
import type { Tick } from '../word.ts'
import { listOf, recorded } from '../word.ts'

/** `where` over a list, with the `tick` it asks once for each row. */
export function whereWith(tick: Tick, ...values: unknown[]): unknown {
  const made = recorded('where', values)
  if (made) return made
  const rows = listOf('where', values[0])
  const filter = filterOf(values[1])
  return rows.filter((row) => {
    tick?.()
    return matches(filter, row)
  })
}

/**
 * One word with two uses. Takes a list and a filter, as a plan writes one, and answers the rows that fit: it reads
 * a row's own fields and nothing else, and handed a reference it answers its record. Or takes a filter alone, or
 * an arrow over the user and `db`, and answers the rule of a table that lets a caller reach the rows that fit.
 * Throws T0027 for a value in the place of the list that is no list.
 */
export function where<Row>(rows: readonly Row[], filter: object): Row[]
export function where(rule: (user: User | undefined, db: QueryDb) => unknown): WhereRule
export function where(filter: object): WhereRule
export function where(...values: unknown[]): unknown {
  return values.length < 2 ? Reflect.apply(whereRule, undefined, values) : whereWith(undefined, ...values)
}
