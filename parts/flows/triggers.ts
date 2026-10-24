import { where } from '../core/index.ts'
import { matches, valueOf, isWritten } from '../core/internal.ts'
import type { Description } from '../core/internal.ts'
import type { Row } from '../data/index.ts'
import type { Fired } from './face.ts'
import type { Source } from './rows.ts'
import { readOf } from './rows.ts'

/** A filter as it is stored. */
type StoredFilter = Parameters<typeof matches>[0]

const isFilter = (value: unknown): value is StoredFilter =>
  isWritten(value) && (typeof value.col === 'string' || 'any' in value || 'all' in value || 'not' in value)

/** Whether an event is the engine's own of the end of a run of this very flow. */
const ownEnd = (flow: string, what: { event: string; data: unknown }): boolean =>
  (what.event === 'run.failed' || what.event === 'run.stopped') && isWritten(what.data) && what.data.flow === flow

/** A flow that a write or an event starts, with the event it is handed. */
export interface Started {
  flow: string
  event: Record<string, unknown>
}

/** The columns that a stored filter names. */
function namedIn(filter: unknown, into: Set<string> = new Set()): Set<string> {
  if (!isWritten(filter)) return into
  if (typeof filter.col === 'string') into.add(filter.col)
  for (const joined of [filter.any, filter.all]) if (Array.isArray(joined)) for (const one of joined) namedIn(one, into)
  if (filter.not !== undefined && typeof filter.col !== 'string') namedIn(filter.not, into)
  return into
}

/**
 * Takes the written row of a trigger and the filter of its `where`. Answers the row as the filter reads it: where
 * the filter reaches through a link, the linked row stands in the place of its id, read once for each linked row,
 * through the write that the row was written in.
 */
function reaching(
  source: Source,
  description: Description,
  table: string,
  row: Row,
  filter: unknown,
  read: Map<string, unknown>,
): Row {
  const columns = Object.hasOwn(description.tables, table) ? description.tables[table].columns : undefined
  const links = new Set([...namedIn(filter)].filter((name) => name.includes('.')).map((name) => name.split('.')[0]))
  if (!links.size || !isWritten(columns)) return row
  const reached: Row = { ...row }
  for (const name of links) {
    const column = columns[name]
    const id = row[name]
    if (!isWritten(column) || typeof column.table !== 'string' || typeof id !== 'string') continue
    const key = `${column.table}\n${id}`
    if (!read.has(key)) read.set(key, readOf(source, { from: column.table, one: 'get', id }))
    reached[name] = read.get(key)
  }
  return reached
}

/**
 * Takes where to read from, the description of the live version, and a table write or an emitted event. Answers
 * the flows whose trigger it fits, each with the event that its run is handed: the row as it was written, with a
 * link as an id.
 */
export function startedBy(source: Source, description: Description, what: Fired): Started[] {
  const found: Started[] = []
  const read = new Map<string, unknown>()
  for (const [flow, record] of Object.entries(description.flows)) {
    for (const trigger of Array.isArray(record.on) ? record.on : []) {
      if (!isWritten(trigger)) continue
      if ('event' in what) {
        if (trigger.event !== what.event) continue
        // A flow is never started by the failure or the stop of one of its own runs, so it cannot start itself without end.
        if (ownEnd(flow, what)) break
        // A trigger that states `where` fires only for an event whose data holds those values.
        if (isWritten(trigger.where) && !(isWritten(what.data) && where([what.data], trigger.where).length)) continue
        found.push({ flow, event: { kind: 'event', name: what.event, data: what.data } })
        break
      }
      if (trigger.table !== what.table || trigger.when !== what.kind) continue
      const columns = Array.isArray(trigger.columns) ? trigger.columns : undefined
      // A trigger that names columns fires for a change of one of them, and only such a trigger for a fill.
      if (columns && what.kind === 'changed' && !columns.some((one) => what.columns?.includes(String(one)))) continue
      if (!columns && what.filled) continue
      if (isFilter(trigger.where)) {
        const row = reaching(source, description, what.table, what.row, trigger.where, read)
        if (!matches(trigger.where, row, (ref) => valueOf(ref))) continue
      }
      found.push({
        flow,
        event: {
          kind: what.kind,
          table: what.table,
          row: what.row,
          ...(what.before ? { before: what.before } : {}),
          ...(what.columns ? { columns: what.columns } : {}),
        },
      })
      break
    }
  }
  return found
}
