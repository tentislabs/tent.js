import type { Tick } from '../word.ts'
import { listOf, recorded, sizedWritten, writtenOut } from '../word.ts'

/** `join` with the `tick` it asks once for each entry. */
export function joinWith(tick: Tick, ...values: unknown[]): unknown {
  const made = recorded('join', values)
  if (made) return made
  sizedWritten('join', [values[1]])
  const between = writtenOut(values[1])
  let text = ''
  for (const [i, entry] of listOf('join', values[0]).entries()) {
    tick?.()
    sizedWritten('join', [entry], text.length + (i ? between.length : 0))
    text += `${i ? between : ''}${writtenOut(entry)}`
  }
  return text
}

/**
 * Takes a list, and the text that stands between its entries. Answers the entries as one text, each written as
 * `concat` writes it. Handed a reference it answers its record. Throws T0027 for a value that is no list, and for a
 * text past the limit.
 */
export function join(list: readonly unknown[], between: string): string
export function join(...values: unknown[]): unknown {
  return joinWith(undefined, ...values)
}
