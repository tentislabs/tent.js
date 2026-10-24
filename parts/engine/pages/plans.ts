import type { Description } from '../../core/internal.ts'
import { isStored, sendsOut } from '../../core/internal.ts'

/** The plans a page works a change out by before it is answered: of each plain change, and of each plain query. */
export interface OptimisticPlans {
  changes: Record<string, { writes: unknown[]; defaults: Record<string, Record<string, unknown>> }>
  queries: Record<string, { plan: unknown }>
}

// The parts of a plan of a query that a page can work over the rows it holds: a filter and an order alone.
const plainParts = new Set(['from', 'where', 'sort'])
// The operators of a filter that a page works out as the engine does.
const operators = new Set([
  'is',
  'not',
  'above',
  'atLeast',
  'below',
  'atMost',
  'in',
  'contains',
  'startsWith',
  'before',
  'after',
  'empty',
])

/** Whether a value of a plan is one a page knows: written in place, an input, now, or the id of the caller. */
function known(value: unknown): boolean {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(known)
  if (!isStored(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== 1) return false
  if (typeof value.input === 'string') return true
  if (value.now === true) return true
  return value.caller === 'id'
}

/** Whether a filter holds only what a page works out: known values under known operators, and their sums. */
function plainFilter(filter: unknown): boolean {
  if (!isStored(filter)) return false
  if (Array.isArray(filter.any)) return filter.any.every(plainFilter)
  if (Array.isArray(filter.all)) return filter.all.every(plainFilter)
  if (filter.not !== undefined && filter.col === undefined) return plainFilter(filter.not)
  if (typeof filter.col !== 'string') return false
  return Object.entries(filter).every(([key, value]) => key === 'col' || (operators.has(key) && known(value)))
}

/** The plan of a plain query that a page can work a change over, or nothing. */
function queryPlan(record: Record<string, unknown>): unknown {
  if (record.kind !== 'query' || record.form !== 'plain' || record.system !== undefined) return undefined
  const plan = record.plan
  if (!isStored(plan) || typeof plan.from !== 'string') return undefined
  if (!Object.keys(plan).every((key) => plainParts.has(key))) return undefined
  if (plan.where !== undefined && !plainFilter(plan.where)) return undefined
  return plan
}

/** The writes of a plain change that a page can show ahead, or nothing: one that sends out or asks a person shows none. */
function changeWrites(record: Record<string, unknown>): unknown[] | undefined {
  if (record.kind !== 'change' || record.form !== 'plain' || !Array.isArray(record.writes)) return undefined
  if (record.danger === 'ask' || record.system !== undefined) return undefined
  const plain = record.writes.every(
    (one) =>
      isStored(one) &&
      one.of === undefined &&
      (typeof one.add === 'string' || typeof one.change === 'string' || typeof one.remove === 'string') &&
      (one.id === undefined || known(one.id)) &&
      Object.values(isStored(one.values) ? one.values : {}).every(known),
  )
  return plain ? record.writes : undefined
}

// The kind of write that sets off each kind of trigger of a flow.
const setOffBy: Record<string, string> = { added: 'add', changed: 'change', removed: 'remove' }

/**
 * Whether the writes of a plain change set off a flow that sends data out: a change that sends, so never shown
 * ahead. A trigger is set off by a write of its own kind, an add of its table for `added`.
 */
function setsOffSending(description: Description, writes: unknown[]): boolean {
  return Object.entries(description.flows).some(
    ([name, flow]) =>
      Array.isArray(flow.on) &&
      flow.on.some((trigger) => {
        const kind = isStored(trigger) && typeof trigger.when === 'string' ? setOffBy[trigger.when] : undefined
        return kind !== undefined && writes.some((one) => isStored(one) && one[kind] === trigger.table)
      }) &&
      sendsOut(description, name),
  )
}

/** Every definition that stored records name, by a behaviour and by an entry of `data`. */
function namedIn(stored: unknown, found: Set<string>): Set<string> {
  if (Array.isArray(stored)) for (const one of stored) namedIn(one, found)
  else if (isStored(stored)) {
    for (const kind of ['function', 'query']) if (typeof stored[kind] === 'string') found.add(String(stored[kind]))
    for (const one of Object.values(stored)) namedIn(one, found)
  }
  return found
}

/** The values a column takes where an add leaves it out, of each table that a change adds to. */
function defaultsOf(description: Description, writes: unknown[]): Record<string, Record<string, unknown>> {
  const defaults: Record<string, Record<string, unknown>> = {}
  for (const one of writes) {
    const table = isStored(one) && typeof one.add === 'string' ? one.add : undefined
    if (!table || !Object.hasOwn(description.tables, table)) continue
    const columns: Record<string, unknown> = Object(Reflect.get(Object(description.tables[table]), 'columns'))
    defaults[table] = Object.fromEntries(
      Object.entries(columns).flatMap(([name, column]) => {
        const given: unknown = Reflect.get(Object(column), 'default')
        return given === undefined || isStored(given) ? [] : [[name, given]]
      }),
    )
  }
  return defaults
}

/**
 * Takes a description and the records of the screen and of the components it uses. Answers the plans by which the
 * page shows a change before it is answered: of each plain change they call, by the names the build read of their
 * files, and of each plain query they read, where a page can work it out over the rows it holds. Nothing where there
 * are none.
 */
export function plansOf(description: Description, records: unknown[]): OptimisticPlans | undefined {
  const named = namedIn(records, new Set<string>())
  // The changes and the actions that the file of a view names, which its presses and forms call.
  for (const record of records)
    if (isStored(record) && Array.isArray(record.calls)) for (const one of record.calls) named.add(String(one))
  const plans: OptimisticPlans = { changes: {}, queries: {} }
  for (const name of [...named].sort()) {
    const record = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
    if (!isStored(record)) continue
    const plan = queryPlan(record)
    if (plan) plans.queries[name] = { plan }
    const planned = changeWrites(record)
    const writes = planned && !setsOffSending(description, planned) ? planned : undefined
    if (writes) plans.changes[name] = { writes, defaults: defaultsOf(description, writes) }
  }
  return Object.keys(plans.changes).length && Object.keys(plans.queries).length ? plans : undefined
}
