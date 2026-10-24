import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/** `app.release`: the worker is handed nothing more. True where it holds no task, so that its machine may be stopped. */
export const member =
  (o: Opened): App['release'] =>
  (worker) => {
    heldOpen(o)
    return o.work?.release(worker) === true
  }
