import { faultOf } from './itself.ts'
import { isStored } from './record.ts'
import { keepAt } from './stored/kept.ts'
import type { Type } from './type.ts'

/** The type of a schema that holds no fault, read as the block below says. */
function typeFrom(schema: unknown): Type {
  if (!isStored(schema)) return { kind: 'json' }
  const values = Array.isArray(schema.enum) ? schema.enum : undefined
  if (values?.length && values.every((one) => typeof one === 'string'))
    return { kind: 'choice', values: values.map(String) }
  switch (schema.type) {
    case 'string':
      return { kind: 'text' }
    case 'number':
      return { kind: 'number' }
    case 'integer':
      return { kind: 'number', whole: true }
    case 'boolean':
      return { kind: 'boolean' }
    case 'array':
      return { kind: 'list', of: typeFrom(schema.items) }
    case 'object': {
      const required = Array.isArray(schema.required) ? schema.required.map(String) : []
      const properties = isStored(schema.properties) ? schema.properties : {}
      const shape: Record<string, Type> = {}
      for (const [name, one] of Object.entries(properties))
        keepAt(shape, name, required.includes(name) ? typeFrom(one) : { ...typeFrom(one), optional: true })
      return { kind: 'object', shape }
    }
    default:
      return { kind: 'json' }
  }
}

/**
 * Takes a JSON Schema, as a model writes one for the form of an answer it asks for. Answers the type of ours that
 * holds a value to it: `string`, `number`, `integer`, `boolean`, `array` with `items`, and `object` with
 * `properties` and `required`, each field under the name the schema writes, and an `enum` of texts as a choice.
 * What it cannot read, as a schema of no `type`, and one that no stored form holds, nested too deep or holding
 * itself, is `json`, which any value fits.
 */
export function fromJsonSchema(schema: unknown): Type {
  return faultOf(schema) ? { kind: 'json' } : typeFrom(schema)
}
