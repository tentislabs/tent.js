import { TentError } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import type { TableModel } from './model.ts'
import { vectorOf, withDirection } from './vector.ts'

// What a plan with `near` does not join with.
const apart = ['sort', 'group', 'count', 'skip', 'after'] as const

/**
 * Takes a table and a plan whose values are worked out. Holds a plan with `near` to what it may be: its column a
 * vector column of the table, a `limit` or `first()`, and joined with `where`, `search`, `with`, `pick`, `limit`
 * and `first()` alone. Throws T2106 otherwise, and T2105 for a value that is no vector of the column's size, or that
 * holds zeros alone where the measure is the cosine.
 */
export function heldNear(model: TableModel, plan: Plan): void {
  const near = plan.near
  if (!near) return
  const wrong = (why: string): TentError =>
    new TentError('T2106', `A plan of \`${model.name}\` with \`near\` ${why}.`, {
      fix: 'A plan with `near` states a `limit` or ends with `first()`, and joins with `where`, `search`, `with` and `pick` alone.',
    })
  const type = Object.hasOwn(model.columns, near.col) ? model.columns[near.col] : undefined
  if (type?.kind !== 'vector') throw wrong(`names \`${near.col}\`, which is no vector column of the table`)
  for (const name of apart) if (name in plan) throw wrong(`is joined with \`${name}\``)
  if (plan.one === 'get') throw wrong('is joined with `get`')
  if (plan.one !== 'first' && typeof plan.limit !== 'number') throw wrong('states no `limit`')
  const to = vectorOf(near.value, type.size, model.name, near.col)
  if (near.measure !== 'straight') withDirection(to, model.name, near.col)
}
