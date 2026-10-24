import { folded, same } from '../matches.ts'
import type { Tick } from '../word.ts'
import { recorded, textOf } from '../word.ts'

/** `contains` with the `tick` it asks once for each entry of a list that it walks. */
export function containsWith(tick: Tick, ...values: unknown[]): unknown {
  const made = recorded('contains', values)
  if (made) return made
  const [held, part] = values
  if (!Array.isArray(held)) return folded(textOf('contains', held)).includes(folded(textOf('contains', part)))
  for (const entry of held) {
    tick?.()
    if (same(entry, part)) return true
  }
  return false
}

/**
 * Takes a text and a part, and answers whether the text holds the part, where capitals of the 26 plain letters do
 * not count. Or takes a list and a value, and answers whether an entry equals the value. Handed a reference it
 * answers its record. Throws T0027 for a value that is neither.
 */
export function contains(text: string, part: string): boolean
export function contains(list: readonly unknown[], value: unknown): boolean
export function contains(...values: unknown[]): unknown {
  return containsWith(undefined, ...values)
}
