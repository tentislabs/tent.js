import { mark } from '../mark.ts'
import { holdsReference, sizedWritten, writtenOut } from '../word.ts'
import { asValue } from '../written.ts'

/**
 * Takes values. Answers them joined as one text: a number as JavaScript writes it, a moment in the standard form,
 * and nothing as empty text. Handed a reference it answers its record. Throws T0027 for a text past the limit.
 */
export function concat(...values: unknown[]): string
export function concat(...values: unknown[]): unknown {
  if (holdsReference(values)) return mark({ concat: values.map(asValue) })
  sizedWritten('concat', values)
  return values.map(writtenOut).join('')
}
