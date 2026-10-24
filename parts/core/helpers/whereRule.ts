import type { User } from '../caller.ts'
import type { QueryDb } from '../db.ts'
import { filterOf } from '../filter.ts'
import { mark } from '../mark.ts'
import type { WhereRule } from './rules.ts'

/**
 * Takes a filter written as a value, in which `caller('id')` stands for the caller, or an arrow that is handed the
 * user and a `db` of plans and answers a filter. Answers the rule of a table that lets a caller reach the rows that
 * fit.
 */
export function whereRule(
  filter: Record<string, unknown> | ((user: User | undefined, db: QueryDb) => unknown),
): WhereRule {
  return mark(
    typeof filter === 'function' ? { rule: 'where', code: filter } : { rule: 'where', filter: filterOf(filter) },
  )
}
