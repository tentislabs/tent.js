import { isStored } from './record.ts'
import type { Type } from './type.ts'

// The words of who reads a field of a row, by the type of that field: a column with a read rule.
const readers = new WeakMap<object, string>()

/** Who a read rule of a column lets in, in the words a line gives them. */
function wordsOf(rule: unknown): string {
  // A rule is stored as its word, or as a record that names its word.
  const word = isStored(rule) ? rule.rule : rule
  if (word === 'role' && isStored(rule)) return String(rule.role)
  if (word === 'owner') return 'its owner'
  if (word === 'signedIn') return 'whoever is signed in'
  if (word === 'nobody') return 'nobody'
  if (word === 'anyone') return 'anyone'
  return 'those its rule lets in'
}

/**
 * Takes the type of a column as a row carries it, and the read rule of the column as it is stored. Answers the
 * type as optional, since a caller outside the rule is handed the row without it, and keeps who reads it for the
 * line of a tool.
 */
export function readByOf(type: Type, rule: unknown): Type {
  const optional: Type = { ...type, optional: true }
  readers.set(optional, wordsOf(rule))
  return optional
}

/** Who reads a field of a row, where a read rule of its column says so: `hr`, `its owner`. */
export const readersOf = (type: unknown): string | undefined => (isStored(type) ? readers.get(type) : undefined)
