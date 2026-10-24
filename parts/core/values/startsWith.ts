import { folded } from '../matches.ts'
import { recorded, textOf } from '../word.ts'

/**
 * Takes a text and a part. Answers whether the text starts with the part, where capitals of the 26 plain letters
 * do not count. Handed a reference it answers its record. Throws T0027 for a value that is no text.
 */
export function startsWith(text: string, part: string): boolean
export function startsWith(...values: unknown[]): unknown {
  return (
    recorded('startsWith', values) ??
    folded(textOf('startsWith', values[0])).startsWith(folded(textOf('startsWith', values[1])))
  )
}
