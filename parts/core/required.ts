import { isStored } from './record.ts'

/**
 * Whether a value of a type must be given: it is not optional, and it has no default to stand in for it. The one
 * rule of it, which the door's check, the schema of an input and the checks of a form read alike.
 */
export function isRequired(type: unknown): boolean {
  if (!isStored(type)) return false
  const hasDefault = type.default !== undefined && type.default !== null
  return type.optional !== true && !hasDefault
}
