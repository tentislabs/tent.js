import type { Type } from '../core/index.ts'
import { TentError } from '../core/index.ts'

/** Where a field of the input of a call is written. */
export type Place = 'path' | 'query' | 'form' | 'header'

/** The error of a value that cannot be written where its call puts it. */
const unwritable = (call: string, field: string, place: Place): TentError =>
  new TentError('T1014', `The field ${field} of ${call} is of a kind that cannot be written into the ${place}.`, {
    fix: 'Put the field where its kind can be written: into the body of the call, or as a value of its own.',
  })

/** Whether a field holds no value: such a field is left out, but a `null` of a `json` field. */
export const unset = (type: Type, value: unknown): boolean =>
  value === undefined || (value === null && type.kind !== 'json')

/** A single value as text: as it is, a number and a yes or no as text, a moment in the standard form. */
function single(call: string, field: string, place: Place, type: Type, value: unknown): string {
  if (['list', 'object', 'json', 'file', 'vector', 'map', 'oneOf', 'ref'].includes(type.kind))
    throw unwritable(call, field, place)
  return typeof value === 'string' ? value : String(value)
}

/**
 * Takes the name of a call, a field, its type and its value, the place it is written in, and how a list is
 * written after the question mark. Answers the pairs of names and texts it is written as: one for a single value,
 * one for each entry of a list, and for a record a pair for each of its fields, as deep as it goes. Throws T1014
 * for a value that the place cannot hold.
 */
export function pairsOf(
  call: string,
  field: string,
  type: Type,
  value: unknown,
  place: Place,
  lists: 'repeat' | 'brackets' | 'comma' = 'repeat',
): [string, string][] {
  if (unset(type, value)) return []
  if (type.kind === 'list' && Array.isArray(value)) {
    if (place === 'path') throw unwritable(call, field, place)
    const entries = value.map((one) => single(call, field, place, type.of, one))
    if (place === 'header' || (place === 'query' && lists === 'comma')) return [[field, entries.join(',')]]
    if (place === 'form') return entries.map((one, i) => [`${field}[${i}]`, one])
    return entries.map((one) => [lists === 'brackets' ? `${field}[]` : field, one])
  }
  if (type.kind === 'object' && typeof value === 'object' && value !== null) {
    if (place === 'path' || place === 'header') throw unwritable(call, field, place)
    const pairs: [string, string][] = []
    for (const [name, inner] of Object.entries(type.shape)) {
      const one: unknown = Reflect.get(value, name)
      pairs.push(...pairsOf(call, `${field}[${name}]`, inner, one, place === 'query' ? 'form' : place, lists))
    }
    return pairs
  }
  return [[field, single(call, field, place, type, value)]]
}
