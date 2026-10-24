import type { Tick } from '../word.ts'
import { numberOf, recorded, textOf } from '../word.ts'

/** `slice` with the `tick` it asks once for each entry of a list that it makes. */
export function sliceWith(tick: Tick, ...values: unknown[]): unknown {
  const made = recorded('slice', values)
  if (made) return made
  const [held, from, to] = values
  const ends = [numberOf('slice', from), to === undefined ? undefined : numberOf('slice', to)] as const
  if (!Array.isArray(held)) return textOf('slice', held).slice(...ends)
  const part = held.slice(...ends)
  for (const _ of part) tick?.()
  return part
}

/**
 * Takes a text or a list, where the part starts, and where it ends. Answers the part, as `slice` of JavaScript
 * gives it: a number below zero counts from the end. Handed a reference it answers its record. Throws T0027 for a
 * value that is neither a text nor a list.
 */
export function slice(text: string, from: number, to?: number): string
export function slice<Entry>(list: readonly Entry[], from: number, to?: number): Entry[]
export function slice(...values: unknown[]): unknown {
  return sliceWith(undefined, ...values)
}
