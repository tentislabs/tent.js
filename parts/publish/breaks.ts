import type { Description } from '../core/internal.ts'
import { isStored } from '../core/internal.ts'
import type { Change } from '../history/index.ts'
import type { Stored } from './impact/read.ts'
import { doorsOf, leftOut, listOf, rankOf, recordsOf } from './impact/read.ts'

/** The definitions that a caller from outside may reach by name: the functions and the flows, the agents among them. */
function offered(description: Description): Map<string, { what: string; record: Stored }> {
  const all = new Map<string, { what: string; record: Stored }>()
  for (const [name, record] of Object.entries(description.functions ?? {}))
    all.set(name, { what: String(record.kind ?? 'function'), record })
  for (const [name, record] of Object.entries(description.flows ?? {}))
    all.set(name, { what: isStored(record.agent) ? 'agent' : 'flow', record })
  return all
}

/** The fields of a type that is a record, or of a list of records: what an answer holds. */
function fieldsOf(type: unknown): Stored | undefined {
  if (!isStored(type)) return undefined
  if (type.kind === 'list') return fieldsOf(type.of)
  return type.kind === 'object' && isStored(type.shape) ? type.shape : undefined
}

/** A day that has passed, by the moment it is held against. */
const past = (day: unknown, now: number): boolean =>
  typeof day === 'string' && Number.isFinite(Date.parse(day)) && Date.parse(day) <= now

/**
 * Takes the description that is live and the one that would follow it. Answers what would break a caller of the
 * API, of MCP or of the command line: a function, a flow or an agent that is gone or is no longer offered to a
 * door it was offered to, an input that became required or changed its type, an output that lost a field, a
 * column gone of a table that an offered query answers, a rule that became narrower in the order `anyone`,
 * `signedIn`, a role, `nobody`, or that is made with `allow`, which counts as changed, and an address of a route
 * that is gone. A definition that was deprecated, and whose day has passed, breaks nobody when it goes.
 */
export function breaks(live: Description, next: Description): Change[] {
  const now = Date.now()
  const changes: Change[] = []
  const after = offered(next)
  for (const [name, { what, record }] of offered(live)) {
    const doors = doorsOf(record)
    if (!doors.length) continue
    const then = after.get(name)
    if (!then) {
      if (!past(record.deprecated, now)) changes.push({ change: 'removed', what, name })
      continue
    }
    const lost = doors.filter((door) => !doorsOf(then.record).includes(door))
    if (lost.length)
      changes.push({ change: 'changed', what, name, path: ['offer'], from: doors, to: doorsOf(then.record) })
    const [was, is] = [isStored(record.input) ? record.input : {}, isStored(then.record.input) ? then.record.input : {}]
    for (const [field, type] of Object.entries(is)) {
      const before = was[field]
      const kindOf = (one: unknown): unknown => (isStored(one) ? one.kind : undefined)
      if (!leftOut(type) && (before === undefined || leftOut(before)))
        changes.push({ change: 'changed', what, name, path: ['input', field], to: 'required' })
      else if (before !== undefined && kindOf(before) !== kindOf(type))
        changes.push({ change: 'changed', what, name, path: ['input', field], from: kindOf(before), to: kindOf(type) })
    }
    // An output that turns from a record into a value loses every field it gave.
    const [gave, gives] = [fieldsOf(record.output), fieldsOf(then.record.output)]
    for (const field of Object.keys(gave ?? {}))
      if (!gives || !Object.hasOwn(gives, field))
        changes.push({ change: 'changed', what, name, path: ['output', field], from: 'given' })
    for (const column of columnsGone(live, next, then.record))
      if (!changes.some((one) => one.name === name && one.path?.join('.') === `output.${column}`))
        changes.push({ change: 'changed', what, name, path: ['output', column], from: 'given' })
    const [rule, rules] = [
      isStored(record.access) ? record.access : {},
      isStored(then.record.access) ? then.record.access : {},
    ]
    // A rule made with `allow` cannot be told wider or narrower: a change of it counts as one that breaks.
    const allows = rule.rule === 'allow' || rules.rule === 'allow'
    if (allows ? JSON.stringify(rule) !== JSON.stringify(rules) : rankOf(rules) > rankOf(rule))
      changes.push({ change: 'changed', what, name, path: ['access'], from: rule.rule, to: rules.rule })
  }
  return [...changes, ...routesGone(live, next, now)]
}

/**
 * The columns that a query offered outside answers of the tables it reads, which the live description holds and
 * the next one does not: a column kept `private` is answered to nobody, and is no loss.
 */
function columnsGone(live: Description, next: Description, record: Stored): string[] {
  if (record.kind !== 'query') return []
  const [was, is] = [recordsOf(live, 'tables'), recordsOf(next, 'tables')]
  return listOf(record.reads).flatMap((table) => {
    const [before, after]: unknown[] = [was[table]?.columns, is[table]?.columns]
    const kept = isStored(after) ? after : {}
    return Object.entries(isStored(before) ? before : {})
      .filter(([column, type]) => !(isStored(type) && type.private === true) && !Object.hasOwn(kept, column))
      .map(([column]) => `${table}.${column}`)
  })
}

/** Each address of a route that is gone: the route is removed, or answers at another method or path. */
function routesGone(live: Description, next: Description, now: number): Change[] {
  const after = recordsOf(next, 'routes')
  return Object.entries(recordsOf(live, 'routes')).flatMap(([name, record]): Change[] => {
    const then = after[name]
    if (!then) return past(record.deprecated, now) ? [] : [{ change: 'removed', what: 'route', name }]
    return (['method', 'path'] as const)
      .filter((field) => then[field] !== record[field])
      .map((field) => ({ change: 'changed', what: 'route', name, path: [field], from: record[field], to: then[field] }))
  })
}
