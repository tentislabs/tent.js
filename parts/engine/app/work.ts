import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/** `app.work`: for each kind of worker what waits, the age of the oldest, what is out, and its workers. */
export const member =
  (o: Opened): App['work'] =>
  () => {
    heldOpen(o)
    return o.work?.work() ?? []
  }
