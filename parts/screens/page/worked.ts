import { isStored, matches } from '../../core/internal.ts'
import type { OptimisticResult } from './store.ts'

/** The plans a page works a change out by, as the engine hands them with the page. */
export interface OptimisticPlans {
  changes: Record<string, { writes: unknown[]; defaults: Record<string, Record<string, unknown>> }>
  queries: Record<string, { plan: unknown }>
}

type Row = Record<string, unknown>
type Filter = Parameters<typeof matches>[0]

// The rows that a page shows from a change before it is answered, which `optimistic` tells a view.
const optimisticRows = new WeakSet<object>()

/** Whether a row was drawn from a change that is not answered yet. */
export const isOptimistic = (row: unknown): boolean =>
  typeof row === 'object' && row !== null && optimisticRows.has(row)

/** What the values of a plan are worked out with: the input of the call or of the query, the caller, and now. */
interface Given {
  input: Record<string, unknown>
  caller?: string
  now: string
}

/** A value of a plan, as the page works it out. */
function givenValue(value: unknown, given: Given): unknown {
  if (Array.isArray(value)) return value.map((one) => givenValue(one, given))
  if (!isStored(value)) return value
  if (typeof value.input === 'string') return given.input[value.input]
  if (value.now === true) return given.now
  if (value.caller === 'id') return given.caller
  return undefined
}

/** Whether the filter of a plan is one: a plan the engine handed holds it as the store keeps it. */
const isFilter = (value: unknown): value is Filter => isStored(value)

/** Whether a row passes the filter of a plan, by the one judge of a filter that the store holds rows to. */
const fits = (row: Row, filter: unknown, given: Given): boolean =>
  !isFilter(filter) || matches(filter, row, (ref) => givenValue(ref, given))

/** What a value ranks by among others: SQLite orders nothing first, then numbers, then texts. */
const rankOf = (value: unknown): number =>
  value === undefined || value === null ? 0 : typeof value === 'number' || typeof value === 'boolean' ? 1 : 2

/** Two values as the store orders them by its default: a number by its size, and a text by its code points. */
function compared(a: unknown, b: unknown): number {
  const [first, second] = [rankOf(a), rankOf(b)]
  if (first !== second) return first - second
  if (first === 1) return Number(a) - Number(b)
  if (first === 0) return 0
  const [one, other] = [[...String(a)], [...String(b)]]
  for (let at = 0; at < Math.min(one.length, other.length); at++) {
    const step = (one[at].codePointAt(0) ?? 0) - (other[at].codePointAt(0) ?? 0)
    if (step !== 0) return step
  }
  return one.length - other.length
}

/** The rows in the order of a plan: by each field it sorts by, and rows side by side in the order they were added. */
function sorted(rows: Row[], plan: Record<string, unknown>): Row[] {
  const by = Array.isArray(plan.sort) ? plan.sort.filter(isStored) : []
  return rows.toSorted((a, b) => {
    for (const one of by) {
      const order = compared(a[String(one.by)], b[String(one.by)])
      if (order !== 0) return one.down === true ? -order : order
    }
    return 0
  })
}

let made = 0

/**
 * Takes the plans that the page holds, a change by its name with its input, and the caller. Answers what the page
 * shows of the change until its answer comes: for each query whose plan it can work over, how its rows change -
 * a row added stands where the query's filter and order put it, a row set shows its values, a row removed is
 * gone. Answers nothing for a change that the plans do not hold, and with it `answered`, which puts the real row
 * of an add in the place of the one shown.
 */
export function workedOut(
  plans: OptimisticPlans | undefined,
  name: string,
  input: unknown,
  caller: string | undefined,
): { results: OptimisticResult[]; answered(value: unknown): void } | undefined {
  const change = plans?.changes[name]
  if (!plans || !change) return undefined
  const given: Given = {
    input: isStored(input) ? input : {},
    ...(caller ? { caller } : {}),
    now: new Date().toISOString(),
  }
  // Each row an add makes, made once, so that every list shows the same row.
  const added = change.writes.map((write): Row | undefined => {
    if (!isStored(write) || typeof write.add !== 'string') return undefined
    made += 1
    const values = Object.fromEntries(
      Object.entries(isStored(write.values) ? write.values : {}).map(([column, value]) => [
        column,
        givenValue(value, given),
      ]),
    )
    const row: Row = {
      ...change.defaults[write.add],
      ...values,
      id: `ahead-${made}`,
      createdAt: given.now,
      updatedAt: given.now,
    }
    optimisticRows.add(row)
    return row
  })
  // The id the engine gave the row of an add, once the call is answered, and whether it is.
  let answeredId: string | undefined
  let settled = false
  const results = Object.entries(plans.queries).flatMap(([query, { plan }]): OptimisticResult[] => {
    if (!isStored(plan)) return []
    const table = String(plan.from)
    if (!change.writes.some((one) => isStored(one) && [one.add, one.change, one.remove].includes(table))) return []
    // The answer each asking held when the result was first laid over it, by the input of the asking.
    const first = new Map<string, unknown[]>()
    return [
      {
        what: query,
        to: (value, _input, asked) => {
          if (!Array.isArray(value)) return value
          const real = answeredId
          const of: Given = { ...given, input: isStored(asked) ? asked : {} }
          // While the call is on its way the result stands over the answer it was first laid over: what live data
          // brings meanwhile, the real row among it, is shown with the call's answer, so no row stands twice.
          const asking = JSON.stringify(asked ?? null)
          if (!settled && !first.has(asking)) first.set(asking, value)
          const over = settled ? value : (first.get(asking) ?? value)
          let rows: Row[] = over.filter(isStored)
          change.writes.forEach((write, place) => {
            if (!isStored(write)) return
            if (write.add === table) {
              const row = added[place]
              // Once the real row stands in what live data brought, it takes the place of the one shown.
              const there = real !== undefined && rows.some((one) => one.id === real)
              if (row && !there && fits(row, plan.where, of)) rows = [...rows, row]
            } else if (write.change === table) {
              const id = givenValue(write.id, given)
              rows = rows.flatMap((row) => {
                if (row.id !== id) return [row]
                const values = Object.entries(isStored(write.values) ? write.values : {})
                const changed: Row = {
                  ...row,
                  ...Object.fromEntries(values.map(([column, one]) => [column, givenValue(one, given)])),
                }
                optimisticRows.add(changed)
                return fits(changed, plan.where, of) ? [changed] : []
              })
            } else if (write.remove === table) {
              const id = givenValue(write.id, given)
              rows = rows.filter((row) => row.id !== id)
            }
          })
          return sorted(rows, plan)
        },
      },
    ]
  })
  return {
    results,
    answered: (value) => {
      settled = true
      // The row that one add answers takes the place of the row shown for it.
      const real = isStored(value) && typeof value.id === 'string' ? value.id : undefined
      if (real && added.filter((one) => one !== undefined).length === 1) answeredId = real
    },
  }
}
