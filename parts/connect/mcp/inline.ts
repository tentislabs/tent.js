import type { Type } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'

/** Every file id that a value holds where its type says a `file` stands: in a field, an entry of a list, or itself. */
export function filesIn(type: Type | undefined, value: unknown): string[] {
  if (!isStored(type)) return []
  if (type.kind === 'file') return typeof value === 'string' ? [value] : []
  if (type.kind === 'list' && Array.isArray(value)) return value.flatMap((one) => filesIn(Object(type).of, one))
  if (type.kind === 'object' && isStored(value)) {
    const shape: unknown = Object(type).shape
    return Object.entries(isStored(shape) ? shape : {}).flatMap(([field, inner]) =>
      isStored(inner) ? filesIn(Object(inner), value[field]) : [],
    )
  }
  return []
}

/** A picture or a sound of an answer as the standard's own part of it, so that a chat app's model is given it. */
export const partOf = (file: {
  kind: string
  bytes: Uint8Array
}): { type: 'image' | 'audio'; data: string; mimeType: string } => ({
  type: file.kind.startsWith('image/') ? 'image' : 'audio',
  data: Buffer.from(file.bytes).toString('base64'),
  mimeType: file.kind,
})

/** The words that the description of a `file` field of an input says: its id comes from an upload. */
const uploadedId = 'The id of a file that was uploaded at /_t/files first.'

/** A schema of an input with each `file` field described as the id of an upload. */
export function withUploads(schema: object, input: Record<string, unknown>): object {
  const properties: unknown = Reflect.get(schema, 'properties')
  if (!isStored(properties)) return schema
  const described = Object.fromEntries(
    Object.entries(properties).map(([field, one]) => {
      const kind: unknown = Reflect.get(Object(input[field]), 'kind')
      return [field, kind === 'file' && isStored(one) ? { ...one, description: uploadedId } : one]
    }),
  )
  return { ...schema, properties: described }
}
