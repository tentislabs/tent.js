import { TentError } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import type { DbContext } from './context.ts'
import type { TableModel } from './model.ts'
import type { Resolve } from './worked.ts'
import { workedValue } from './worked.ts'

// A plan that ranks and ends with `first()` and states no `limit` ranks this many rows, and answers the best.
const firstAmong = 10

/** The text of a row that a model ranks: its columns that `search` names, and else every column that holds text. */
function textOf(model: TableModel, row: Record<string, unknown>): string {
  const names = model.search.length
    ? model.search
    : Object.keys(model.columns).filter((name) => model.columns[name]?.kind === 'text')
  return names
    .map((name) => row[name])
    .filter((value) => typeof value === 'string')
    .join('\n')
}

/**
 * Takes the context of a `db`, the table, a plan with `rank`, what answers its values, and what carries a plan out.
 * Reads the rows of the plan under the caller's rule, has the model of `rank` score each by the words, and answers
 * a promise of the rows in the order of their scores, the `top` of them where it is stated: a row with the same
 * score keeps its place. A plan that ranks calls a model, so it stands where a model call may: in an action, a
 * route or a step. Throws T0013 in a query and a change, where no model is called.
 */
export function rankedRead(
  cx: DbContext,
  model: TableModel,
  stored: Plan,
  resolve: Resolve,
  carry: (plan: Plan) => unknown,
): Promise<unknown> {
  const rank = stored.rank
  if (!rank || cx.mode !== 'async' || !cx.o.ranker)
    throw new TentError(
      'T0013',
      `A plan of \`${model.name}\` ranks its rows with a model, where no model may be called.`,
      {
        fix: 'Rank in an action, a route or a step of a flow: a query and a change call no model.',
      },
    )
  const { rank: _, one, ...plan } = stored
  const words = String(workedValue(rank.words, resolve) ?? '')
  const top = rank.top === undefined ? undefined : Number(workedValue(rank.top, resolve))
  const read: unknown = carry(one === 'first' ? { ...plan, limit: plan.limit ?? firstAmong } : plan)
  const ranker = cx.o.ranker
  return (async () => {
    // Where the db waits, the rows may come as a promise.
    const got: unknown = await read
    const rows = (Array.isArray(got) ? got : []).map((row): Record<string, unknown> => Object(row))
    const scores = rows.length
      ? await ranker(
          rank.model,
          words,
          rows.map((row) => textOf(model, row)),
        )
      : []
    const ordered = rows
      .map((row, at) => ({ row, at, score: Number(scores[at] ?? 0) }))
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .map((one) => one.row)
    const kept = top === undefined ? ordered : ordered.slice(0, top)
    return one === 'first' ? kept[0] : kept
  })()
}
