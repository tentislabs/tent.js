import type { Description, Plan } from './description.ts'
import type { Stored } from './record.ts'
import { isStored } from './record.ts'
import { readByOf } from './readBy.ts'
import { ofColumn } from './stored/type.ts'
import { tableColumns } from './shown.ts'
import type { Type } from './type.ts'
import { boolean } from './types/boolean.ts'
import { date } from './types/date.ts'
import { json } from './types/json.ts'
import { list } from './types/list.ts'
import { number } from './types/number.ts'
import { object } from './types/object.ts'
import { text } from './types/text.ts'

/** Whether a stored record is a type: the description was checked, so its kind says so. */
const isType = (value: unknown): value is Type => isStored(value) && typeof value.kind === 'string'

/** The type of a column as a row carries it: without what belongs to the column alone. */
function carried(column: Stored): Type | undefined {
  const type = Object.fromEntries(Object.entries(column).filter(([name]) => !ofColumn.includes(name)))
  return isType(type) ? type : undefined
}

/** The columns of a table, each as it is stored. */
function columnsOf(description: Description, table: string): Record<string, Stored> {
  const columns = tableColumns(description, table)
  const found: Record<string, Stored> = {}
  for (const [name, one] of Object.entries(isStored(columns) ? columns : {})) if (isStored(one)) found[name] = one
  return found
}

/** The type of a row of a table: `id`, `createdAt`, `updatedAt` and each column that is not private. A vector is there only where it is picked, and a link that is followed holds its row. */
function rowOf(description: Description, table: string, followed: string[] = [], picked?: string[]): Type {
  const shape: Record<string, Type> = { id: text(), createdAt: date(), updatedAt: date() }
  for (const [name, column] of Object.entries(columnsOf(description, table))) {
    if (column.private === true || (column.kind === 'vector' && !picked?.includes(name))) continue
    // A column with a read rule is left out of the row for a caller the rule does not let in: it may be missing.
    const held = carried(column)
    const type = held && column.read !== undefined ? readByOf(held, column.read) : held
    const inner = followed.filter((one) => one.startsWith(`${name}.`)).map((one) => one.slice(name.length + 1))
    const linked = followed.includes(name) || inner.length
    if (type)
      shape[name] =
        linked && typeof column.table === 'string'
          ? withOptional(rowOf(description, column.table, inner), column.optional === true)
          : type
  }
  return object(picked ? Object.fromEntries(Object.entries(shape).filter(([name]) => picked.includes(name))) : shape)
}

const withOptional = (type: Type, optional: boolean): Type => (optional ? { ...type, optional: true } : type)

/** Whether a vector column keeps its copy at one byte a number, so that a `near` over it says it is not exact. */
const smallCopy = (description: Description, table: string, column: unknown): boolean =>
  Reflect.get(Object(columnsOf(description, table)[String(column)]), 'copy') === 'small'

/** The type of what a plan answers. */
function ofPlan(description: Description, plan: Stored): Type | undefined {
  const table = String(plan.from)
  if (!description.tables[table]) return undefined
  if (plan.count === true) return number()
  const names = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
  if (plan.history === true) return list(object({ at: date(), by: text(), value: rowOf(description, table) }))
  if (isStored(plan.group)) {
    const columns = columnsOf(description, table)
    const shape: Record<string, Type> = {}
    for (const by of names(plan.group.by)) {
      const type = columns[by] && columns[by].private !== true ? carried(columns[by]) : undefined
      if (type) shape[by] = type
    }
    for (const [name, value] of Object.entries(isStored(plan.group.values) ? plan.group.values : {})) {
      const [[word, column]] = Object.entries(isStored(value) ? value : { count: true })
      if (typeof column === 'string' && columns[column]?.private === true) continue
      const held = typeof column === 'string' && columns[column] ? carried(columns[column]) : undefined
      shape[name] = (word === 'min' || word === 'max') && held ? withOptional(held, true) : number()
    }
    return list(object(shape))
  }
  const base = rowOf(description, table, names(plan.with), plan.pick === undefined ? undefined : names(plan.pick))
  // Words and meaning together give each row its place in the joined list, and a distance where its meaning was near.
  const both = isStored(plan.near) && plan.search !== undefined
  const row =
    isStored(plan.near) && base.kind === 'object'
      ? object({
          ...base.shape,
          ...(both ? { distance: number({ optional: true }), rank: number() } : { distance: number() }),
          ...(smallCopy(description, table, plan.near.col) ? { exact: boolean({ optional: true }) } : {}),
        })
      : base
  if (plan.one === 'get' || plan.one === 'first') return withOptional(row, true)
  if (plan.after !== undefined) return object({ rows: list(row), next: text({ optional: true }) })
  return list(row)
}

/**
 * Takes a description, and the name of a function, a flow or a model, or a plan. Answers the type of what it
 * answers: the declared `output` where there is one; for a query written with `rows`, and for a plan, the type
 * worked out from the plan; for a change written with `set` the row of its write, nothing for a removal and
 * `json` for a list of writes; `{ text }` for an agent, with `value` of its `output` where it states one; and nothing where the type is not known.
 */
export function answerOf(description: Description, what: string | Plan): Type | undefined {
  if (typeof what !== 'string') return ofPlan(description, { ...what })
  const flow = description.flows[what]
  const model = description.models[what]
  const record = description.functions[what] ?? flow ?? model
  if (!record) return undefined
  if (flow?.agent !== undefined) {
    // An agent that states `output` answers the value of that type beside its text.
    const output: unknown = Reflect.get(Object(flow.agent), 'output')
    return isType(output) ? object({ text: text(), value: output }) : object({ text: text() })
  }
  if (isType(record.output)) return record.output
  if (isStored(record.plan)) return ofPlan(description, record.plan)
  if (Array.isArray(record.writes)) {
    const [write] = record.writes
    if (record.writes.length !== 1 || !isStored(write)) return json()
    const table = write.add ?? write.change
    return typeof table === 'string' ? rowOf(description, table) : undefined
  }
  if (model && isStored(model.call)) {
    const calls = description.services[String(model.call.service)]?.calls
    const call = isStored(calls) ? calls[String(model.call.call)] : undefined
    return isStored(call) && isType(call.output) ? call.output : undefined
  }
  return undefined
}
