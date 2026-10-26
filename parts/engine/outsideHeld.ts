import { TentError } from '../core/index.ts'

// Whether this program holds whatever would reach outside it: the cases made from the declarations of an app reach
// nothing. A thread and a program that it starts hold it too, told by a word of the environment they are handed.
const word = 'TENT_HELD_OUTSIDE'
let held = process.env[word] === '1'

/** Holds from now on whatever would reach outside this program, its threads and the programs it starts. */
export function holdOutside(): void {
  held = true
  process.env[word] = '1'
}

/** Whether this program holds whatever would reach outside it. */
export const outsideHeld = (): boolean => held

/** The refusal of what would have reached outside, in a case that reaches nothing: `what` names it in a few words. */
export const heldRefusal = (what: string): TentError =>
  new TentError('T7132', `${what} was called in a case made from the declarations, which reaches nothing outside.`, {
    fix: 'A test of what the definition does with a real answer is written by hand, with `app.fake`.',
  })
