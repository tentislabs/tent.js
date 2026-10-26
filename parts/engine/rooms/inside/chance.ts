import type { Runtime } from '../../../core/internal.ts'
import { standChance } from '../../../core/internal.ts'
import type { Carry } from './runtime.ts'

/**
 * Takes how a call is carried in this heap and the runtime slot over its ways. Stands a `Date` and a `Math.random`
 * in place of the heap's own: the code of a call reads the clock and the source of numbers of its app, as the words
 * `now()` and `random()` draw them, so a test app's held clock and random seed reach the code in a room that crosses
 * as in the program. Outside a call, and where a word draws nothing, the heap's own answer.
 */
export function chanceIn(carry: Carry, runtime: Runtime): void {
  const OwnDate = globalThis.Date
  const drawn = (word: 'now' | 'random'): unknown =>
    carry.current() === undefined ? undefined : runtime.draw(word, [])?.value
  standChance(
    () => {
      const at = drawn('now')
      return at instanceof OwnDate ? at.getTime() : typeof at === 'number' ? at : undefined
    },
    () => {
      const number = drawn('random')
      return typeof number === 'number' ? number : undefined
    },
  )
}
