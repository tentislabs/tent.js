import type { Type } from '../core/index.ts'
import { checkValue, isWritten } from '../core/internal.ts'
import type { Description } from '../core/internal.ts'

const isType = (stored: unknown): stored is Type => isWritten(stored) && typeof stored.kind === 'string'

/** A saved value as code is handed it, read back through its type: a moment is a `Date` again. */
function through(type: unknown, value: unknown): unknown {
  if (!isType(type) || value === undefined || value === null) return value
  if (type.kind === 'date') return typeof value === 'string' ? new Date(value) : value
  if (type.kind === 'list' && Array.isArray(value)) return value.map((one) => through(type.of, one))
  if (type.kind === 'object' && isWritten(value))
    return Object.fromEntries(Object.entries(value).map(([name, one]) => [name, through(type.shape[name], one)]))
  return value
}

/** The input of a run as its flow is handed it on every pass, read back through the types of the flow's `input`. */
export function inputOf(record: Record<string, unknown>, saved: unknown): unknown {
  if (!isWritten(saved)) return saved
  const fields = isWritten(record.input) ? record.input : {}
  return Object.fromEntries(Object.entries(saved).map(([name, value]) => [name, through(fields[name], value)]))
}

/** A row of a table as a trigger hands it: `createdAt`, `updatedAt` and each column of the type `date` as a `Date`. */
function rowOf(description: Description, table: unknown, saved: unknown): unknown {
  if (!isWritten(saved) || typeof table !== 'string') return saved
  const stored = Object.hasOwn(description.tables, table) ? description.tables[table].columns : undefined
  const columns: Record<string, unknown> = {
    ...(isWritten(stored) ? stored : {}),
    createdAt: { kind: 'date' },
    updatedAt: { kind: 'date' },
  }
  return Object.fromEntries(Object.entries(saved).map(([name, value]) => [name, through(columns[name], value)]))
}

/**
 * The event of a run as its flow is handed it on every pass: the moment of a timed trigger and the dates of the
 * row of a table trigger are a `Date` again, and the data of an event is as it travelled.
 */
export function eventOf(description: Description, saved: unknown): unknown {
  if (!isWritten(saved)) return saved
  if (saved.kind === 'time') return { ...saved, at: through({ kind: 'date' }, saved.at) }
  if (saved.kind === 'added' || saved.kind === 'changed' || saved.kind === 'removed')
    return {
      ...saved,
      row: rowOf(description, saved.table, saved.row),
      ...('before' in saved ? { before: rowOf(description, saved.table, saved.before) } : {}),
    }
  return saved
}

/** A value with nothing in it that its type does not name. */
function filtered(type: Type, value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  if (type.kind === 'list' && Array.isArray(value)) return value.map((one) => filtered(type.of, one))
  if (type.kind === 'object' && isWritten(value)) {
    const made: Record<string, unknown> = {}
    for (const [name, field] of Object.entries(type.shape)) {
      const one = filtered(field, value[name])
      if (one !== undefined) made[name] = one
    }
    return made
  }
  return value
}

/**
 * Takes the record of a flow and what a run of it answered. Answers the answer filtered through the flow's
 * `output`, where it states one: only what the type names passes. Answers the words of the misfit, as `misfit`,
 * for an answer that does not fit.
 */
export function flowAnswer(record: Record<string, unknown>, value: unknown): { value: unknown } | { misfit: string } {
  if (!isType(record.output)) return { value }
  const answer = filtered(record.output, value)
  const [found] = checkValue(record.output, answer)
  return found ? { misfit: found.message } : { value: answer }
}
