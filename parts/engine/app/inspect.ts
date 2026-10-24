import type { App } from '../app.ts'
import { makeInspectToken } from '../inspected.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/**
 * `app.inspect`: a token that puts a page of the app into the inspect mode for a tool whose pages come from one
 * origin, or that opens the page in a window of its own. The program that holds the app gives it, in any mode.
 */
export const member =
  (o: Opened): App['inspect'] =>
  (given) => {
    heldOpen(o)
    return makeInspectToken(o, given)
  }
