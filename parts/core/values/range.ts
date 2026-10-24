import type { Tick } from '../word.ts'
import { cannot, numberOf, recorded, sized } from '../word.ts'

/** `range` with the `tick` it asks once for each entry. */
export function rangeWith(tick: Tick, ...values: unknown[]): unknown {
  const made = recorded('range', values)
  if (made) return made
  const [from, to] = [numberOf('range', values[0]), numberOf('range', values[1])]
  const by = values[2] === undefined ? 1 : numberOf('range', values[2])
  if (by === 0 || Number.isNaN(by)) cannot('range', values[2], 'a step that is not zero')
  const count = Math.max(0, Math.ceil((to - from) / by))
  if (!Number.isFinite(count)) cannot('range', values[1], 'numbers that give a list with an end')
  sized('range', count)
  const numbers: number[] = []
  for (let i = 0; i < count; i++) {
    tick?.()
    numbers.push(from + i * by)
  }
  return numbers
}

/**
 * Takes where the numbers start, the number they lie before, and the step between two of them, which is 1 where
 * none is given and below zero for a list that falls. Answers the numbers. Handed a reference it answers its
 * record. Throws T0027 for a step of zero, and for a list past the limit.
 */
export function range(from: number, to: number, by?: number): number[]
export function range(...values: unknown[]): unknown {
  return rangeWith(undefined, ...values)
}
