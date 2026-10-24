// A checker of JSON Schema for the tests, for the words that the schema of a description is written with. A word
// it does not know throws, so that a schema with one more word is never held to pass by being ignored.

type Schema = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const known = new Set([
  '$defs',
  '$ref',
  'additionalProperties',
  'anyOf',
  'enum',
  'format',
  'items',
  'maxItems',
  'maxLength',
  'maximum',
  'minItems',
  'minLength',
  'minimum',
  'pattern',
  'properties',
  'required',
  'type',
])

const ofType = (type: unknown, value: unknown): boolean => {
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number'
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isRecord(value)
  if (type === 'null') return value === null
  throw new Error(`the checker does not know the type ${String(type)}`)
}

/**
 * Takes a schema, a value, and the schema that holds the kept shapes. Answers each place of the value that does
 * not fit, by its dotted name, with what it fails. A value that fits answers an empty list.
 */
export function misfits(schema: unknown, value: unknown, whole: unknown = schema, at = ''): string[] {
  if (!isRecord(schema)) throw new Error(`a schema at ${at} is no record`)
  for (const word of Object.keys(schema)) if (!known.has(word)) throw new Error(`the checker does not know ${word}`)
  const s: Schema = schema
  if (typeof s.$ref === 'string') {
    const kept = isRecord(whole) && isRecord(whole.$defs) ? whole.$defs[s.$ref.replace('#/$defs/', '')] : undefined
    if (kept === undefined) throw new Error(`the schema keeps no shape ${s.$ref}`)
    return misfits(kept, value, whole, at)
  }
  if (Array.isArray(s.anyOf)) {
    const tried = s.anyOf.map((one) => misfits(one, value, whole, at))
    return tried.some((one) => !one.length) ? [] : [`${at}: fits none of ${tried.length} (${tried[0].join('; ')})`]
  }
  const found: string[] = []
  if (s.type !== undefined && !ofType(s.type, value)) return [`${at}: is no ${String(s.type)}`]
  if (Array.isArray(s.enum) && !s.enum.includes(value)) found.push(`${at}: is none of the values`)
  if (typeof value === 'string') {
    const length = [...value].length
    if (typeof s.minLength === 'number' && length < s.minLength) found.push(`${at}: is too short`)
    if (typeof s.maxLength === 'number' && length > s.maxLength) found.push(`${at}: is too long`)
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(value)) found.push(`${at}: does not fit`)
  }
  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) found.push(`${at}: is too small`)
    if (typeof s.maximum === 'number' && value > s.maximum) found.push(`${at}: is too large`)
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) found.push(`${at}: has too few entries`)
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) found.push(`${at}: has too many entries`)
    if (s.items !== undefined)
      for (const [k, one] of value.entries()) found.push(...misfits(s.items, one, whole, `${at}.${k}`))
  }
  if (isRecord(value)) {
    const properties = isRecord(s.properties) ? s.properties : {}
    for (const name of Array.isArray(s.required) ? s.required : [])
      if (!(String(name) in value)) found.push(`${at}.${String(name)}: is required`)
    for (const [name, one] of Object.entries(value)) {
      const below = at ? `${at}.${name}` : name
      if (name in properties) found.push(...misfits(properties[name], one, whole, below))
      else if (s.additionalProperties === false) found.push(`${below}: is no field of the shape`)
      else if (isRecord(s.additionalProperties)) found.push(...misfits(s.additionalProperties, one, whole, below))
    }
  }
  return found
}
