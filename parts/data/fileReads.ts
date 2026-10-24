import { TentError } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import { matches } from '../core/internal.ts'
import type { DbContext } from './context.ts'
import type { FileName } from './fileName.ts'
import { notOneFile } from './fileName.ts'
import { isId } from './ids.ts'
import type { TableModel } from './model.ts'
import { tableOf, typeIn } from './model.ts'
import type { Filter } from './worked.ts'
import { isPlan } from '../core/internal.ts'

// The rows of the shared file that a filter through a link, and a plan that is answered first, may give, where the
// db states no bound of its own: the default of `limits.liveRows`.
const liveRows = 10_000

/** The error of a read that gave more rows than may stand in a filter as a list. */
const tooMany = (table: string, bound: number): TentError =>
  new TentError('T2108', `A read of \`${table}\` that another file waits for answered more than ${bound} rows.`, {
    fix: 'Narrow the filter, or keep a copy of the value in the row that is filtered by it.',
  })

/**
 * Takes the context of a `db`, a table, the tenant that a chain or a write names with `of`, and whether the
 * plan stands inside a rule. Answers the file the rows live in: nothing for a table of the shared file, the file
 * of the tenant, or `'none'` for what names no tenant. A plan inside the rule of a tenant table whose
 * tenants are of the same table names none, and is read in the file the rule is applied in. Throws T2109 for any other chain on
 * a tenant table that names no tenant.
 */
export function fileOf(cx: DbContext, model: TableModel, of: unknown, inRule: boolean): FileName | 'none' | undefined {
  if (model.tenantTable === undefined || !cx.files) return undefined
  if (of !== undefined && of !== null) return isId(of) ? { table: model.tenantTable, id: of } : 'none'
  if (inRule && cx.at?.table === model.tenantTable) return cx.at
  throw notOneFile(
    `a chain on \`${model.name}\`, which is a tenant table, names no tenant`,
    `Begin the chain with ${model.name}.of(tenant).`,
  )
}

/** Carries something out with the `db` at work in one file, or in the shared file, and puts it back where it was. */
export function within<T>(cx: DbContext, file: FileName | undefined, run: () => T): T {
  const before = cx.at
  cx.at = file
  try {
    return run()
  } finally {
    cx.at = before
  }
}

/** What is known of a filter where one column of the row is known: that it holds, that it does not, or nothing. */
function known(filter: Filter, column: string, row: Record<string, unknown>): boolean | undefined {
  if ('any' in filter && Array.isArray(filter.any)) {
    const each = filter.any.map((one: Filter) => known(one, column, row))
    if (each.includes(true) || !each.length) return true
    return each.every((one) => one === false) ? false : undefined
  }
  if ('all' in filter && Array.isArray(filter.all)) {
    const each = filter.all.map((one: Filter) => known(one, column, row))
    if (each.includes(false)) return false
    return each.every((one) => one === true) ? true : undefined
  }
  if (!('col' in filter)) {
    const inner = 'not' in filter ? known(filter.not, column, row) : undefined
    return inner === undefined ? undefined : !inner
  }
  // No value is in an empty list, whatever the column holds.
  if (Array.isArray(filter.in) && filter.in.length === 0) return false
  if (filter.col !== column || Object.values(filter).some(isPlan)) return undefined
  return matches(filter, row)
}

/**
 * Takes a filter, the tenant column of a table, and a tenant. Answers whether the
 * filter already fits no row of that tenant, by what it asks of that column alone: no file is opened or made
 * for a caller whose rule does not reach the tenant.
 */
export const fitsNone = (filter: Filter | undefined, column: string, tenant: string): boolean =>
  filter !== undefined && known(filter, column, { [column]: tenant }) === false

/** Answers a filter with each plan inside it read first: its answer stands in its place as a list. */
export function plansAnswered(cx: DbContext, filter: Filter): Filter {
  if ('any' in filter && Array.isArray(filter.any))
    return { any: filter.any.map((one: Filter) => plansAnswered(cx, one)) }
  if ('all' in filter && Array.isArray(filter.all))
    return { all: filter.all.map((one: Filter) => plansAnswered(cx, one)) }
  if (!('col' in filter)) return 'not' in filter ? { not: plansAnswered(cx, filter.not) } : filter
  const answered: Filter = { col: filter.col }
  for (const [operator, value] of Object.entries(filter))
    answered[operator] = isPlan(value) ? answeredFirst(cx, value) : value
  return answered
}

/** Reads a plan whose rows another read waits for, and answers what it gives as a list: its first picked column, or the id. */
export function answeredFirst(cx: DbContext, plan: Plan): unknown[] {
  const bound = cx.o.limits?.rows ?? liveRows
  const limited = typeof plan.limit === 'number' && plan.limit <= bound
  const rows = cx.read(limited ? plan : { ...plan, limit: bound + 1 })
  const all: Record<string, unknown>[] = Array.isArray(rows) ? rows : []
  if (all.length > bound) throw tooMany(plan.from, bound)
  const gives = plan.pick?.[0] ?? 'id'
  return all.map((row) => row[gives]).filter((value) => value !== undefined)
}

/**
 * Takes the context of a `db` that is at work in the file of a tenant, a table of that file, and a filter.
 * Answers the filter with each condition that reads through a link into the shared file answered there first: the
 * shared side is read, and the file is searched for the ids it gave. `under` puts the plan of the shared side
 * under the rules of the caller, and answers nothing where they read no row of it: it is handed for what a plan
 * itself asks, and left out for the filter of a rule.
 */
export function throughShared(
  cx: DbContext,
  model: TableModel,
  filter: Filter,
  under?: (linked: TableModel, plan: Plan) => Plan | undefined,
): Filter {
  if ('any' in filter && Array.isArray(filter.any))
    return { any: filter.any.map((one: Filter) => throughShared(cx, model, one, under)) }
  if ('all' in filter && Array.isArray(filter.all))
    return { all: filter.all.map((one: Filter) => throughShared(cx, model, one, under)) }
  if (!('col' in filter)) return 'not' in filter ? { not: throughShared(cx, model, filter.not, under) } : filter
  const names = filter.col.split('.')
  let at = model
  for (const [i, name] of names.entries()) {
    const type = typeIn(at, name)
    if (type?.kind !== 'link' || i === names.length - 1) return filter
    const linked = tableOf(cx.description, type.table)
    if (linked.tenantTable === undefined) {
      const { col: _, given: __, ...asked } = filter
      const where: Filter = { ...asked, col: names.slice(i + 1).join('.') }
      const ids = within(cx, undefined, () => {
        const plan: Plan = { from: linked.name, where, pick: ['id'] }
        const held = under ? under(linked, plan) : plan
        return held ? answeredFirst(cx, held) : []
      })
      return { col: names.slice(0, i + 1).join('.'), in: ids }
    }
    at = linked
  }
  return filter
}
