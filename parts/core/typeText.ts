import { isStored } from './record.ts'
import { readersOf } from './readBy.ts'
import type { Type } from './type.ts'

/** Whether a field of a record may be left out: it is optional, or it has a default. */
const mayBeLeftOut = (type: unknown): boolean =>
  isStored(type) && (type.optional === true || type.default !== undefined)

/** A type as `typeText` writes it, with nothing said of whether it may be nothing. */
function bare(type: unknown): string {
  if (!isStored(type)) return 'any'
  switch (type.kind) {
    case 'text':
      return 'string'
    case 'number':
    case 'boolean':
    case 'date':
    case 'day':
      return String(type.kind)
    case 'json':
      return 'any'
    case 'choice':
      return (Array.isArray(type.values) ? type.values : []).map((one) => `'${String(one)}'`).join(' | ')
    case 'link':
      return `id of ${String(type.table)}`
    case 'file':
      return 'file id'
    case 'vector':
      return 'number[]'
    case 'list': {
      const entry = bare(type.of)
      return isStored(type.of) && type.of.kind === 'choice' ? `(${entry})[]` : `${entry}[]`
    }
    case 'object': {
      const fields = fieldsText(type.shape)
      return fields ? `{ ${fields} }` : '{}'
    }
    default:
      return 'any'
  }
}

/** The fields of a record as `typeText` writes them, without the braces: `a: T, b?: T`, in the order they are stored. */
export function fieldsText(shape: unknown): string {
  return Object.entries(isStored(shape) ? shape : {})
    .map(([name, type]) => {
      const readers = readersOf(type)
      return `${name}${mayBeLeftOut(type) ? '?' : ''}: ${bare(type)}${readers ? ` (read by ${readers})` : ''}`
    })
    .join(', ')
}

/**
 * Takes a type. Answers it as one line of text, for a model and a person to read: no TypeScript, but the words of
 * the table of `typeText`. A type that is optional and stands alone is followed by ` or nothing`.
 */
export function typeText(type: Type): string {
  const written = bare(type)
  return isStored(type) && type.optional === true ? `${written} or nothing` : written
}
