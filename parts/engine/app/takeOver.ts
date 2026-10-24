import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/** `app.takeOver`: on a reader, it becomes the writer of what it holds. */
export const member =
  (o: Opened): App['takeOver'] =>
  () => {
    heldOpen(o)
    return o.machine.takeOver()
  }
