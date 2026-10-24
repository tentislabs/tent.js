import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/** `app.workers`: each worker that is joined to the writer, with its kinds, what it works on and since when it is joined. */
export const member =
  (o: Opened): App['workers'] =>
  () => {
    heldOpen(o)
    return o.work?.workers() ?? []
  }
