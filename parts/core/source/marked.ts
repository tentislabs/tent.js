import { measureAt } from '../description.ts'
import type { Measure } from './plain.ts'

/**
 * Takes the names on the way to a field of the description, with `*` for any key of a map. Answers the form of a
 * number there as the shape marks it: a length of time or a size in words, and any other value as it stands.
 */
export const marked = (...path: string[]): Measure => measureAt(...path) ?? 'plain'
