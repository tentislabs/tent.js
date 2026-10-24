import type { Description } from '../../core/internal.ts'
import type { Change } from './change.ts'
import type { Described } from './definitions.ts'
import { definitionChanges } from './definitions.ts'

/**
 * Takes two descriptions, the older first. Answers what changed from the one to the other in the terms of compare,
 * read from their records alone: a code definition is changed where its record is, and the text of its source is
 * not read.
 */
export function changesOf(a: Description, b: Description): Change[] {
  const [older, newer]: Described[] = [Object(a), Object(b)]
  return definitionChanges(older, newer, () => undefined)
}
