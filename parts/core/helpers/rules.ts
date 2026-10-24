import type { User } from '../caller.ts'
import type { QueryDb } from '../db.ts'
import type { Filter } from '../filter.ts'
import { mark } from '../mark.ts'

/** The rule that lets a caller with a role in. */
interface RoleRule {
  rule: 'role'
  role: string
}

/** The rule that lets anyone in, with the reason written down. */
export interface AnyoneRule {
  rule: 'anyone'
  why: string
}

/** The rule of a table that lets a caller reach the rows that fit a filter: written as a value, or worked out by an arrow. */
export interface WhereRule {
  rule: 'where'
  filter?: Filter
  code?: (user: User | undefined, db: QueryDb) => unknown
}

/** The rule of a function that looks at the input or at rows. */
interface AllowRule {
  rule: 'allow'
  code: (user: User | undefined, input: never, db: QueryDb) => boolean
}

/** A rule that a function, a flow, a route and a screen may state. */
export type Rule = 'nobody' | 'signedIn' | 'anyone' | RoleRule | AnyoneRule | AllowRule

/** A rule that a table may state for its rows. */
export type TableRule = 'nobody' | 'signedIn' | 'anyone' | 'owner' | RoleRule | AnyoneRule | WhereRule

/** Takes the name of a role. Answers the rule that lets a caller with that role in. */
export function role(name: string): RoleRule {
  return mark({ rule: 'role', role: name })
}

/** Takes the reason. Answers the rule that lets anyone in. */
export function anyone(why: string): AnyoneRule {
  return mark({ rule: 'anyone', why })
}

/**
 * Takes an arrow that is handed the user, the checked input and a `db` that reads as the caller, and answers true
 * or false. Answers the rule that asks it. The arrow may not be async.
 */
export function allow<Input = Record<string, unknown>>(
  test: (user: User | undefined, input: Input, db: QueryDb) => boolean,
): AllowRule {
  return mark({ rule: 'allow', code: test })
}
