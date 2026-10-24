import type { Type } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { checkValue } from '../core/internal.ts'

/** Whether a stored record is the record of a type. */
export const isType = (stored: unknown): stored is Type =>
  typeof stored === 'object' && stored !== null && typeof Reflect.get(stored, 'kind') === 'string'

/** The fields of an input as the description stores them, as one type. */
export function shapeOf(fields: unknown): Type & { kind: 'object' } {
  const shape: Record<string, Type> = {}
  for (const [name, type] of Object.entries(Object(fields))) if (isType(type)) shape[name] = type
  return { kind: 'object', shape }
}

/** A value as the wire carries it: a moment as text in the standard form, which the checker of a type reads. */
function onTheWire(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(onTheWire)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(Object.entries(value).map(([name, one]) => [name, onTheWire(one)]))
  return value
}

/**
 * Takes the name of a call, the fields of its input as the description stores them, and what code handed it.
 * Answers the input with every moment written as text in the standard form, and a field with no value and no
 * default left out. Throws T0002 where a field does not fit its type or is not declared: `fields` names each.
 */
export function callInput(name: string, fields: unknown, given: unknown): Record<string, unknown> {
  const type = shapeOf(fields)
  const input = onTheWire(given ?? {})
  const found = checkValue(type, input)
  if (found.length) {
    const failed = Object.assign({}, ...found.map((one) => one.fields ?? {}))
    const more = found.length > 1 ? `, and ${found.length - 1} more` : ''
    throw new TentError('T0002', `The input of ${name} does not fit: ${found[0].message.replace(/\.$/, '')}${more}.`, {
      fields: failed,
      fix: 'Give each field of the call a value of its declared type, and no field that is not declared.',
    })
  }
  const made: Record<string, unknown> = {}
  for (const [field, one] of Object.entries(type.shape)) {
    const value = Reflect.get(Object(input), field)
    const stated: unknown = 'default' in one ? one.default : undefined
    if (value !== undefined) made[field] = value
    else if (stated !== undefined && stated !== null && typeof stated !== 'object') made[field] = stated
  }
  return made
}
