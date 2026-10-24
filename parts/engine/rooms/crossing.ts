// How what cannot cross as it is crosses between two heaps: a failure, and the rows of a read as JSON text.
import { TentError } from '../../core/index.ts'
import type { FileName } from '../../data/fileName.ts'
import { NotReady } from '../../data/fileName.ts'

/** A failure as it crosses between two threads, which hand each other no error whole. */
export interface Crossed {
  code?: string
  message: string
  // The kind of an error of the runtime that is no failure of ours, as `RangeError`, so it is made again as one.
  name?: string
  // What a failure of ours carries beside its code and its words.
  fix?: string
  where?: TentError['where']
  fields?: Record<string, string>
  place?: TentError['place']
  service?: TentError['service']
  // The file of a tenant that is not ready, by which the engine steers the call: it brings the file up first.
  file?: FileName
  trace?: string
  // The ref under which the thread wrote it into the log.
  ref?: string
  // What the failure rests on: a failure itself, or a value as it is where it can cross.
  cause?: { failed: Crossed } | { value: unknown }
}

// How many failures that rest on each other cross with the first: a longer row is cut there.
const deepest = 8

/** Whether a value can cross to another thread as it is. */
function crosses(value: unknown): boolean {
  try {
    structuredClone(value)
    return true
  } catch {
    return false
  }
}

/** What a failure rests on, as it crosses: nothing for a row of causes that is too long, and for a value that cannot cross. */
function causeOf(error: Error, depth: number): Crossed['cause'] | undefined {
  const cause: unknown = error.cause
  if (cause === undefined || depth >= deepest) return undefined
  if (cause instanceof Error) return { failed: crossedAt(cause, depth + 1) }
  return crosses(cause) ? { value: cause } : undefined
}

function crossedAt(error: unknown, depth: number, ref?: string): Crossed {
  const told = error instanceof TentError ? error : undefined
  const cause = error instanceof Error ? causeOf(error, depth) : undefined
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && !told && error.name !== 'Error' ? { name: error.name } : {}),
    ...(told ? { code: told.code } : {}),
    ...(told?.fix ? { fix: told.fix } : {}),
    ...(told?.where ? { where: told.where } : {}),
    ...(told?.fields ? { fields: told.fields } : {}),
    ...(told?.place ? { place: told.place } : {}),
    ...(told?.service && crosses(told.service) ? { service: told.service } : {}),
    ...(error instanceof NotReady ? { file: { table: error.file.table, id: error.file.id } } : {}),
    ...(error instanceof Error && error.stack ? { trace: error.stack } : {}),
    ...(ref ? { ref } : {}),
    ...(cause ? { cause } : {}),
  }
}

/**
 * Takes an error, and the ref it was written into the log under, where it was. Answers it as it crosses to
 * another thread: with everything a failure of ours carries, its trace, and what it rests on.
 */
export const crossed = (error: unknown, ref?: string): Crossed => crossedAt(error, 0, ref)

// The kinds of error of the language itself, which are made again as the kind they were.
const kinds: Record<string, ErrorConstructor> = {
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
}

/** Takes a failure that crossed. Answers the error it stands for, with what it carried and what it rests on. */
export function revived(failed: Crossed): Error {
  const { fix, where, fields, place, service } = failed
  const more = {
    ...(fix ? { fix } : {}),
    ...(where ? { where } : {}),
    ...(fields ? { fields } : {}),
    ...(place ? { place } : {}),
    ...(service ? { service } : {}),
  }
  const Kind = failed.name === undefined ? Error : (kinds[failed.name] ?? Error)
  const error =
    failed.code !== undefined
      ? new TentError(failed.code, failed.message, more)
      : failed.file
        ? new NotReady(failed.file)
        : new Kind(failed.message)
  if (failed.code === undefined && failed.name !== undefined && !Object.hasOwn(kinds, failed.name))
    error.name = failed.name
  if (failed.trace) error.stack = failed.trace
  if (failed.cause) error.cause = 'failed' in failed.cause ? revived(failed.cause.failed) : failed.cause.value
  return error
}

// The kinds of a column whose values JSON holds as themselves.
const heldByJson = new Set(['text', 'number', 'boolean', 'day', 'json', 'choice', 'link', 'file', 'vector'])

/** Whether JSON holds every value of a column of a type as itself, inside a list, a record or a map as well. */
function jsonHolds(type: unknown): boolean {
  const kind: unknown = Reflect.get(Object(type), 'kind')
  if (kind === 'list' || kind === 'map') return jsonHolds(Reflect.get(Object(type), 'of'))
  if (kind === 'object') return Object.values(Object(Reflect.get(Object(type), 'shape'))).every(jsonHolds)
  if (kind === 'oneOf') {
    const of: unknown = Reflect.get(Object(type), 'of')
    return Array.isArray(of) && of.every(jsonHolds)
  }
  return typeof kind === 'string' && heldByJson.has(kind)
}

/** Whether JSON writes a value as itself: a text, a finite number, a yes or no, or null. */
const plainInJson = (value: unknown): boolean =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value))

/**
 * Takes the rows that a read answered, and the columns of their table. Answers them as JSON text, with the columns
 * that hold a moment, each written as a number and made a `Date` again where it arrives, where JSON holds every
 * other value of that table as itself; and nothing where they cross by the structured clone, as every other value
 * does. This is the one choice between the two forms.
 */
export function rowsAsText(
  rows: unknown,
  columns: Record<string, unknown> | undefined,
): { text: string; moments: string[] } | undefined {
  if (!Array.isArray(rows) || columns === undefined) return undefined
  const moments = ['createdAt', 'updatedAt']
  for (const [name, type] of Object.entries(columns)) {
    if (Reflect.get(Object(type), 'kind') === 'date') moments.push(name)
    else if (!jsonHolds(type)) return undefined
  }
  // A field that no column declares, as one a grouped read worked out, is held by what it holds in each row.
  const known = new Set([...Object.keys(columns), ...moments, 'id'])
  const [found, numbers] = [new Set<string>(), new Set<string>()]
  for (const row of rows)
    for (const [name, value] of Object.entries(Object(row))) {
      if (known.has(name)) continue
      if (value instanceof Date) found.add(name)
      else if (!plainInJson(value)) return undefined
      else if (typeof value === 'number') numbers.add(name)
    }
  // A field that holds a moment in one row and a number in another could not be told apart where it arrives.
  for (const name of found) {
    if (numbers.has(name)) return undefined
    moments.push(name)
  }
  // A moment is written as its number: the text of a `Date` is many times slower to write and to read.
  const written = rows.map((row: unknown) => {
    const copy: Record<string, unknown> = { ...Object(row) }
    for (const name of moments) {
      const at = copy[name]
      if (at instanceof Date) copy[name] = at.getTime()
    }
    return copy
  })
  return { text: JSON.stringify(written), moments }
}

/** Takes rows as `rowsAsText` wrote them, and their columns that hold a moment. Answers the rows. */
export function rowsOfText(text: string, moments: readonly string[]): unknown {
  const rows: unknown = JSON.parse(text)
  if (Array.isArray(rows))
    for (const row of rows)
      for (const name of moments) {
        const at: unknown = Reflect.get(Object(row), name)
        if (typeof at === 'number') Reflect.set(row, name, new Date(at))
      }
  return rows
}
