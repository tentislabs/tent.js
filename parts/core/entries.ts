import { fieldOf } from './field.ts'
import { isDay, momentOf } from './time.ts'
import type { Tick } from './word.ts'
import { cannot, listOf } from './word.ts'

/** Answers the values of a list, or of one field of each of its entries, without those that hold nothing. */
function valuesOf(word: string, tick: Tick, list: unknown, field: unknown): unknown[] {
  if (field !== undefined && typeof field !== 'string') cannot(word, field, 'the name of a field')
  const names = typeof field === 'string' ? field.split('.') : []
  const values: unknown[] = []
  for (const entry of listOf(word, list)) {
    tick?.()
    const value = fieldOf(entry, names)
    if (value !== undefined && value !== null) values.push(value)
  }
  return values
}

/**
 * Takes a word, its `tick`, a list, and the name of a field. Answers the numbers of the list, or of that field of
 * each entry, without the entries that hold nothing. Throws T0027 for an entry that is no number, and for a value
 * that is no list.
 */
export function numbersOf(word: string, tick: Tick, list: unknown, field: unknown): number[] {
  return valuesOf(word, tick, list, field).map((value) =>
    typeof value === 'number' ? value : cannot(word, value, 'numbers'),
  )
}

/** The kind of a value that is compared, and what it is compared by. */
function ofKind(word: string, value: unknown): { kind: string; by: number | string } {
  if (typeof value === 'number') return { kind: 'number', by: value }
  if (isDay(value)) return { kind: 'day', by: value }
  const ms = momentOf(value)
  return ms === undefined
    ? cannot(word, value, 'numbers, days or moments, all of one kind')
    : { kind: 'moment', by: ms }
}

/**
 * Takes a word, its `tick`, a list, the name of a field, and whether the largest is asked for. Answers the smallest
 * or the largest of the numbers, the days or the moments of the list, as the entry held it, and nothing for an
 * empty list. Throws T0027 for an entry of another kind, and for two kinds in one list.
 */
export function extreme(word: string, tick: Tick, list: unknown, field: unknown, largest: boolean): unknown {
  let best: { value: unknown; kind: string; by: number | string } | undefined
  for (const value of valuesOf(word, tick, list, field)) {
    const one = ofKind(word, value)
    if (best && best.kind !== one.kind) cannot(word, value, 'numbers, days or moments, all of one kind')
    if (!best || (largest ? one.by > best.by : one.by < best.by)) best = { value, ...one }
  }
  return best?.value
}
