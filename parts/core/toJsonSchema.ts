import { TentError } from './errors.ts'
import { refuseFault } from './itself.ts'
import { isStored } from './record.ts'
import { isRequired } from './required.ts'
import type { Type } from './type.ts'
import { shapeOf } from './types/ref.ts'

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Writes a record with the members that are there, in the order they are handed. */
const withMembers = (members: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(members).filter(([, value]) => value !== undefined))

const noType = (): TentError =>
  new TentError('T1014', 'A schema is written of a type, and what was handed holds a value that is none.')

/**
 * Writes a type as the schema of a place where a value stands. A value that may be left out may also be `null`,
 * which says that it was not given, as the checker of values takes it.
 */
function schemaAt(type: Type, names: Set<string>): Record<string, unknown> {
  const schema = schemaOf(type, names)
  return isRequired(type) || !Object.keys(schema).length ? schema : { anyOf: [schema, { type: 'null' }] }
}

/** Writes one type as a schema, and adds each kept shape that it names to `names`. */
function schemaOf(type: Type, names: Set<string>): Record<string, unknown> {
  if (!isStored(type)) throw noType()
  switch (type.kind) {
    case 'text':
      return withMembers({ type: 'string', minLength: type.min, maxLength: type.max, pattern: type.pattern })
    case 'number':
      return withMembers({ type: type.whole === true ? 'integer' : 'number', minimum: type.min, maximum: type.max })
    case 'boolean':
      return { type: 'boolean' }
    case 'date':
      return { type: 'string', format: 'date-time' }
    case 'day':
      return { type: 'string', format: 'date' }
    case 'json':
      return {}
    case 'choice':
      return { type: 'string', enum: [...type.values] }
    case 'link':
    case 'file':
      return { type: 'string', minLength: 1 }
    case 'list':
      return withMembers({ type: 'array', items: schemaAt(type.of, names), minItems: type.min, maxItems: type.max })
    case 'object': {
      // The fields have no order of their own: by their names, a type gives one text however it was written.
      const fields = Object.keys(type.shape).sort(byName)
      const needed = fields.filter((name) => isRequired(type.shape[name]))
      return withMembers({
        type: 'object',
        properties: Object.fromEntries(fields.map((name) => [name, schemaAt(type.shape[name], names)])),
        required: needed.length ? needed : undefined,
        additionalProperties: false,
      })
    }
    case 'vector':
      return { type: 'array', items: { type: 'number' }, minItems: type.size, maxItems: type.size }
    case 'oneOf':
      return { anyOf: type.of.map((one) => schemaOf(one, names)) }
    case 'map':
      return { type: 'object', additionalProperties: schemaAt(type.of, names) }
    case 'ref':
      names.add(type.name)
      return { $ref: `#/$defs/${type.name}` }
    // What is handed is held here, whatever its type says: a record of a kind that is none is no type.
    default:
      throw noType()
  }
}

/**
 * Takes a type. Answers it as JSON Schema 2020-12, with the fields of a record and the names of its `required` in
 * the order of their names. A value that may be left out may be `null` too. A kept shape that the type names stands
 * under `$defs`. Throws T0009 where a shape names a shape that nothing has kept, and T1014 for a type that holds
 * itself or is nested more than 200 deep.
 */
export function toJsonSchema(type: Type): object {
  refuseFault(type)
  const names = new Set<string>()
  const schema = schemaAt(type, names)
  const kept: Record<string, object> = {}
  // A kept shape may name more kept shapes, which the set takes in while it is walked.
  for (const name of names) kept[name] = schemaOf(shapeOf(name), names)
  if (!names.size) return schema
  return { ...schema, $defs: Object.fromEntries([...names].sort(byName).map((name) => [name, kept[name]])) }
}
