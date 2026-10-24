import type { Plan } from '../core/internal.ts'
import type { DbContext } from './context.ts'
import type { TableModel } from './model.ts'
import { tableOf, typeIn } from './model.ts'
import type { StorePlan } from './store.ts'
import type { Filter } from './worked.ts'

/** Answers what the caller's `read` rule lets them read of a table: every row, no row, or the rows that fit a filter. */
type ReachOf = (model: TableModel) => Filter | 'all' | 'none'

/**
 * The filter that holds where every linked row on the way of a name may be read by the caller, or where a link on
 * that way holds nothing. Nothing where the caller reads every row on the way. Each linked table is read under the
 * caller's rule by a plan inside `in`, so it stays one question.
 */
function seen(cx: DbContext, model: TableModel, links: string[], reach: ReachOf): Filter | undefined {
  const [first, ...rest] = links
  const type = typeIn(model, first)
  if (type?.kind !== 'link') return undefined
  const linked = tableOf(cx.description, type.table)
  const rule = reach(linked)
  const deeper = rest.length ? seen(cx, linked, rest, reach) : undefined
  if (rule === 'all' && !deeper) return undefined
  const none: Filter = { col: first, empty: true }
  if (rule === 'none') return none
  const where = [...(rule === 'all' ? [] : [rule]), ...(deeper ? [deeper] : [])]
  const plan: Plan = { from: linked.name, where: where.length === 1 ? where[0] : { all: where } }
  return { any: [none, { col: first, in: plan }] }
}

/**
 * Takes the context of a `db`, the table of a plan, the filter that the plan itself asks, and what the caller
 * reads of a table. Answers the filter with each entry that reads a column through a link held to the caller's
 * `read` rule of every table on its way: a linked row that the caller may not read fits no such entry.
 */
export function seenThrough(cx: DbContext, model: TableModel, filter: Filter, reach: ReachOf): Filter {
  const each = (filters: Filter[]) => filters.map((one) => seenThrough(cx, model, one, reach))
  if ('any' in filter && Array.isArray(filter.any)) return { any: each(filter.any) }
  if ('all' in filter && Array.isArray(filter.all)) return { all: each(filter.all) }
  if (!('col' in filter)) return 'not' in filter ? { not: seenThrough(cx, model, filter.not, reach) } : filter
  const names = filter.col.split('.')
  const held = names.length > 1 ? seen(cx, model, names.slice(0, -1), reach) : undefined
  return held ? { all: [held, filter] } : filter
}

/** The names that a plan sorts by, groups by, and works a value of a group out of. A pick reads through no link. */
const namesOf = (plan: Plan): string[] => [
  ...(plan.sort ?? []).map((one) => one.by),
  ...(plan.group?.by ?? []),
  ...Object.values(plan.group?.values ?? {}).flatMap((value) => Object.values(value).map(String)),
]

/**
 * Takes the context of a `db`, the table of a plan, the plan, and what the caller reads of a table. Answers what
 * the store is handed as `linked`: for each table that a sort or a group of the plan reads through a link, the
 * filter of the caller's `read` rule, or `false` where the caller reads no row of it. Nothing where the caller
 * reads every row of each.
 */
export function linkedOf(cx: DbContext, model: TableModel, plan: Plan, reach: ReachOf): StorePlan['linked'] {
  const linked: NonNullable<StorePlan['linked']> = {}
  for (const name of namesOf(plan)) {
    let at = model
    for (const link of name.split('.').slice(0, -1)) {
      const type = typeIn(at, link)
      if (type?.kind !== 'link') break
      at = tableOf(cx.description, type.table)
      const rule = reach(at)
      if (rule !== 'all') linked[at.name] = rule === 'none' ? false : rule
    }
  }
  return Object.keys(linked).length ? linked : undefined
}
