import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/** `app.ready`: answers once the app is open. An app that is awake is open, so it answers at once. */
export const member =
  (o: Opened): App['ready'] =>
  async () => {
    heldOpen(o)
  }
