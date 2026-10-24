import type { Caller, Type } from '../../core/index.ts'
import { dayOf, TentError } from '../../core/index.ts'
import { checkValue, isWritten } from '../../core/internal.ts'

/** Whether a stored record is the record of a type: the shape of the description holds it to be one. */
export const isType = (stored: unknown): stored is Type =>
  typeof stored === 'object' && stored !== null && typeof Reflect.get(stored, 'kind') === 'string'

/** The fields of an input as the description stores them, as one type. */
function shapeOf(fields: unknown): Type {
  const shape: Record<string, Type> = {}
  for (const [name, type] of Object.entries(Object(fields))) if (isType(type)) shape[name] = type
  return { kind: 'object', shape }
}

/** What a default that is no value stands for: the moment of the call, its day, and the caller. */
interface Drawn {
  now: Date
  zone: string
  caller: Caller
}

/** The value that a type holds for a field that was not given: nothing, or what its default says. */
function defaultOf(type: Type, drawn: Drawn): unknown {
  const stated: unknown = 'default' in type ? type.default : undefined
  if (stated === undefined || stated === null) return undefined
  if (isWritten(stated)) {
    if (stated.now === true) return drawn.now
    if (stated.today === true) return dayOf(drawn.now, drawn.zone)
    if (stated.caller === 'id') return drawn.caller.user?.id
    // An object that the author wrote is stored as the list of its entries.
    if (Array.isArray(stated.object)) return Object.fromEntries(stated.object)
  }
  return stated
}

/** A checked value as code is handed it: a moment as a `Date`, a field that was not given left out or as its default. */
function handed(type: Type, value: unknown, drawn: Drawn): unknown {
  if (value === undefined || value === null) return defaultOf(type, drawn)
  if (type.kind === 'date') return value instanceof Date ? value : new Date(String(value))
  if (type.kind === 'list' && Array.isArray(value)) return value.map((one) => handed(type.of, one, drawn))
  if (type.kind === 'object' && isWritten(value)) {
    const made: Record<string, unknown> = {}
    for (const [name, field] of Object.entries(type.shape)) {
      const one = handed(field, value[name], drawn)
      if (one !== undefined) made[name] = one
    }
    return made
  }
  return value
}

/**
 * Takes the name of a function, the fields of its input as the description stores them, what was given, and what
 * a default that is no value stands for. Holds what was given to the declared types, and answers the input as the
 * function is handed it. No input at all is an empty one. Throws T0002 where a field does not fit, or is not
 * declared: `fields` names each by its dotted name, with the check it failed.
 */
export function checkedInput(name: string, fields: unknown, given: unknown, drawn: Drawn): Record<string, unknown> {
  const type = shapeOf(fields)
  const found = checkValue(type, given ?? {})
  if (found.length) {
    const failed = Object.assign({}, ...found.map((one) => one.fields ?? {}))
    const more = found.length > 1 ? `, and ${found.length - 1} more` : ''
    throw new TentError('T0002', `The input of ${name} does not fit: ${found[0].message.replace(/\.$/, '')}${more}.`, {
      fields: failed,
      fix: 'Give each field of the input a value of its declared type, and no field that is not declared.',
    })
  }
  const input = handed(type, given ?? {}, drawn)
  return isWritten(input) ? input : {}
}
