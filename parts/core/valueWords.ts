import { avgWith } from './values/avg.ts'
import { between } from './values/between.ts'
import { calc } from './values/calc.ts'
import { ceil } from './values/ceil.ts'
import { concat } from './values/concat.ts'
import { chunksWith } from './values/chunks.ts'
import { containsWith } from './values/contains.ts'
import { dayOf } from './values/dayOf.ts'
import { eachWith } from './values/each.ts'
import { earlier } from './values/earlier.ts'
import { fingerprint } from './values/fingerprint.ts'
import { floor } from './values/floor.ts'
import { joinWith } from './values/join.ts'
import { later } from './values/later.ts'
import { least } from './values/least.ts'
import { lower } from './values/lower.ts'
import { maxWith } from './values/max.ts'
import { minWith } from './values/min.ts'
import { most } from './values/most.ts'
import { now } from './values/now.ts'
import { random } from './values/random.ts'
import { rangeWith } from './values/range.ts'
import { round } from './values/round.ts'
import { sameSecret } from './values/sameSecret.ts'
import { sliceWith } from './values/slice.ts'
import { startsWith } from './values/startsWith.ts'
import { sumWith } from './values/sum.ts'
import { token } from './values/token.ts'
import { trim } from './values/trim.ts'
import { upper } from './values/upper.ts'
import { whereWith } from './values/where.ts'
import type { Tick } from './word.ts'

/** The value words that work on what they are handed alone, each by its name. */
const plain: Record<string, (...values: never[]) => unknown> = {
  between,
  calc,
  ceil,
  concat,
  dayOf,
  earlier,
  fingerprint,
  floor,
  later,
  least,
  lower,
  most,
  now,
  random,
  round,
  sameSecret,
  startsWith,
  token,
  trim,
  upper,
}

/** The value words that make or walk a list, each as a function of its `tick` and its values. */
const ticked: Record<string, (tick: Tick, ...values: unknown[]) => unknown> = {
  avg: avgWith,
  chunks: chunksWith,
  contains: containsWith,
  each: eachWith,
  join: joinWith,
  max: maxWith,
  min: minWith,
  range: rangeWith,
  slice: sliceWith,
  sum: sumWith,
  where: whereWith,
}

/**
 * Every value word by its name, as a function of a `tick` and its values: what carries a stored form out calls a
 * word by the name its record holds, and hands the `tick` on to each word that asks it once for each entry.
 */
export const valueWords: Record<string, (tick: Tick, ...values: unknown[]) => unknown> = {
  ...Object.fromEntries(
    Object.entries(plain).map(([name, word]) => [
      name,
      (_: Tick, ...values: unknown[]) => Reflect.apply(word, undefined, values),
    ]),
  ),
  ...ticked,
}
