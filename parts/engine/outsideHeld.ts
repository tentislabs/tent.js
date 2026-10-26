import { TentError } from '../core/index.ts'

// Whether this program holds whatever would reach outside it: the cases made from the declarations of an app reach
// nothing, and what the engine cannot stand in for by a name is refused where it would leave.
let held = false

/** Holds from now on whatever would reach outside this program: a request of a page, a connection of the app's code. */
export function holdOutside(): void {
  held = true
}

/** Whether this program holds whatever would reach outside it. */
export const outsideHeld = (): boolean => held

/** The refusal of what would have reached outside, in a case that reaches nothing: `what` names it in a few words. */
export const heldRefusal = (what: string): TentError =>
  new TentError('T7132', `${what} was called in a case made from the declarations, which reaches nothing outside.`, {
    fix: 'A test of what the definition does with a real answer is written by hand, with `app.fake`.',
  })
