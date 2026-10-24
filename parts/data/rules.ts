import type { Caller, User } from '../core/index.ts'
import { TentError, table, where } from '../core/index.ts'
import type { Description, Plan } from '../core/internal.ts'
import { valueOf } from '../core/internal.ts'
import type { TableModel } from './model.ts'
import { tableNames } from './model.ts'
import type { Filter, Resolve } from './worked.ts'
import { isPlan } from '../core/internal.ts'
import { workedFilter } from './worked.ts'
import { callerText } from './callerText.ts'

/**
 * A `where` rule that is code, once its module is loaded: it is handed the user and a `db` that gives plans only,
 * and answers a filter as it is written: a record from each column to what is asked of it, which is stored here.
 * One that calls `db.sql`, `db.n` or `db.system` is T0013.
 */
export type RuleCode = (user: User | undefined, db: object) => Record<string, unknown>

/** What a rule lets a caller reach of a table: every row, no row, or the rows that fit a filter. */
type Reach = 'all' | 'none' | Filter

/** What a rule is worked out with. */
export interface Ruling {
  description: Description
  caller: Caller
  rules: Record<string, RuleCode>
  // Makes a plan inside a filter ready to be read: under the caller's own `read` rule of its table.
  inner(plan: Plan): unknown
}

/** What a rule answered for one caller: what they reach, the name of the rule, and the words of a refusal. */
export interface Ruled {
  reach: Reach
  rule: string
  why: string
}

/** The roles a caller has: those of its key where it is one, and of its user otherwise. */
const rolesOf = (caller: Caller): string[] => caller.key?.roles ?? caller.user?.roles ?? []

/** The error of a rule that reaches for what only code with full access has. */
const plansAlone = (member: string): TentError =>
  new TentError('T0013', `A \`where\` rule used \`db.${member}\`: the \`db\` of a rule gives plans alone.`, {
    fix: 'Answer a filter that is written with the plans of `db`. What needs full access is read by a query that states `system`.',
  })

// A `db` that gives plans only, for a rule that is an arrow: each table as the word `table` makes it. What a `db`
// with full access has beside its tables is there to refuse, so that a rule which reaches for it fails by a code.
const planDbs = new WeakMap<Description, object>()
function planDb(description: Description): object {
  const held = planDbs.get(description)
  if (held) return held
  const made = Object.fromEntries(tableNames(description).map((name) => [name, table(name, {})]))
  for (const member of ['sql', 'n'])
    Object.defineProperty(made, member, {
      value: () => {
        throw plansAlone(member)
      },
    })
  Object.defineProperty(made, 'system', {
    get: () => {
      throw plansAlone('system')
    },
  })
  planDbs.set(description, made)
  return made
}

/** Answers what the references of a rule stand for: the caller, and nothing for anything else. */
export const ruleResolve =
  (caller: Caller): Resolve =>
  (ref) =>
    valueOf(ref, { ref: (one) => ('caller' in one ? caller.user?.id : undefined) })

/** A filter as an arrow of a rule wrote it, stored. */
function storedFilter(written: unknown): Filter {
  if (typeof written !== 'object' || written === null)
    throw new TentError('T0009', 'The arrow of a `where` rule answered no filter.')
  const { filter } = where(written)
  if (!filter) throw new TentError('T0009', 'The arrow of a `where` rule answered no filter.')
  return filter
}

/**
 * Takes what a rule is worked out with, a table, and what is asked of its rows. Answers what the rule lets the
 * caller reach, with the name of the rule and the words of a refusal. A table has `nobody` for what it does not
 * state. A `where` rule that is code is asked as a function handed in under `<table>_access_<what>`, and one whose
 * arrow was read is worked out here, with no module loaded. Throws T0009 for a rule that is code and was not handed in.
 */
export function ruled(cx: Ruling, model: TableModel, what: 'read' | 'add' | 'change' | 'remove'): Ruled {
  const record = model.access[what] ?? { rule: 'nobody' }
  const rule = String(record.rule)
  const { user } = cx.caller
  // A key and a program that a person signed in are signed in, also where no user stands behind them.
  const signedIn = user !== undefined || cx.caller.kind === 'key' || cx.caller.kind === 'mcp'
  const signed = signedIn ? 'the caller is signed in' : 'the caller is not signed in'
  const at = `${model.name}.${what}`
  const answer = (reach: Reach, why: string): Ruled => ({ reach, rule, why: `${at} ${why}` })
  const resolve = ruleResolve(cx.caller)
  const filtered = (filter: Filter) => {
    // An entry that is left out while its value holds nothing would open the table to a caller who has none.
    if (holdsGiven(filter))
      throw new TentError('T1014', `The rule of ${at} answers a filter that holds \`given\`.`, {
        fix: 'Write the entry without `given`: a rule asks the same of every caller.',
      })
    // A filter that comes to nothing reaches no row.
    return answer(workedFilter(filter, resolve, cx.inner) ?? 'none', 'needs a row that its rule lets the caller reach')
  }
  switch (rule) {
    case 'anyone':
      return answer('all', '')
    case 'signedIn':
      return answer(signedIn ? 'all' : 'none', `needs a signed-in caller; ${signed}`)
    case 'role': {
      const has = rolesOf(cx.caller).includes(String(record.role))
      return answer(has ? 'all' : 'none', `needs role '${String(record.role)}'; ${signed} and has no such role`)
    }
    case 'owner': {
      // On `users` the row is the caller's own: its id is the caller.
      const column = model.name === 'users' ? 'id' : model.owner
      // The counts of a visitor are the rows of their visitor id, which stands in `caller`.
      const visitor = model.stored && !user && cx.caller.visitor !== undefined
      const mine: Reach = visitor
        ? { col: 'caller', is: callerText(cx.caller) }
        : user && column
          ? { col: column, is: user.id }
          : 'none'
      return answer(mine, `needs the owner of the row; ${signed}${signedIn ? ' and is not its owner' : ''}`)
    }
    case 'where': {
      if (record.filter !== undefined) return filtered(toFilter(record.filter))
      const db = planDb(cx.description)
      if (record.give !== undefined) {
        const names = Array.isArray(record.as) ? record.as.map(String) : ['user', 'db']
        return filtered(storedFilter(valueOf(record.give, { names: { [names[0]]: user, [names[1]]: db } })))
      }
      const code = cx.rules[`${model.name}_access_${what}`]
      if (!code) throw new TentError('T0009', `The rule of ${at} is code, and its function was not handed in.`)
      return filtered(storedFilter(code(user, db)))
    }
    default:
      return answer('none', 'is open to nobody')
  }
}

/** Whether a filter holds an entry written with `given`, in itself or in a plan inside it. */
function holdsGiven(filter: Filter): boolean {
  if ('any' in filter && Array.isArray(filter.any)) return filter.any.some(holdsGiven)
  if ('all' in filter && Array.isArray(filter.all)) return filter.all.some(holdsGiven)
  if (!('col' in filter)) return 'not' in filter && holdsGiven(filter.not)
  if (filter.given === true) return true
  return Object.values(filter).some((value) => isPlan(value) && value.where !== undefined && holdsGiven(value.where))
}

const isFilter = (stored: unknown): stored is Filter =>
  typeof stored === 'object' &&
  stored !== null &&
  ('col' in stored || 'any' in stored || 'all' in stored || 'not' in stored)

/** Reads a record of the description as a filter: the shape of the description holds it to be one. */
function toFilter(stored: unknown): Filter {
  if (isFilter(stored)) return stored
  throw new TentError('T0011', 'A rule of the description holds no filter.')
}
