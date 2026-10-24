import type { Plan } from '../core/internal.ts'
import type { Row } from './store.ts'

// The constant of reciprocal rank fusion: a row's share of each list is 1 / (k + its place there).
const k = 60

// How many rows each of the two searches answers for each row the plan asks for, before the two are joined.
const depthOf = 4

/**
 * Takes a plan that holds both `search` and `near`, under the rule already, and what reads a plan. Reads the rows
 * that the words find and the rows nearest by meaning, each search under the same filter, and joins the two lists
 * by their ranks (reciprocal rank fusion, with no weight to tune). Answers the `limit` best rows, each with `rank`,
 * its place from 1, and `distance` where its meaning was near enough to be in the second list.
 */
export function fused(plan: Plan, read: (plan: Plan) => Row[]): Row[] {
  const limit = plan.one === 'first' ? 1 : typeof plan.limit === 'number' ? plan.limit : 1
  const depth = Math.max(limit * depthOf, limit)
  const { near: _near, one: _one, ...byWords } = plan
  const { search: _search, one: __one, ...byMeaning } = plan
  const lists = [read({ ...byWords, limit: depth }), read({ ...byMeaning, limit: depth })]
  const score = new Map<string, number>()
  const rows = new Map<string, Row>()
  for (const list of lists)
    list.forEach((row, at) => {
      const id = String(row.id)
      score.set(id, (score.get(id) ?? 0) + 1 / (k + at + 1))
      // The row of the search by meaning carries its distance.
      rows.set(id, { ...rows.get(id), ...row })
    })
  // At the same score, the row that was found first stays first.
  const found = [...rows.keys()]
  const place = new Map(found.map((id, at) => [id, at]))
  const joined = [...found].sort(
    (a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || (place.get(a) ?? 0) - (place.get(b) ?? 0),
  )
  return joined.slice(0, limit).map((id, at) => ({ ...rows.get(id), rank: at + 1 }))
}
