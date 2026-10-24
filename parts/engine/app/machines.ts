import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/** `app.machines`: every machine of the app, as this one knows them, the writer first. */
export const member =
  (o: Opened): App['machines'] =>
  () => {
    heldOpen(o)
    return o.machine.machines()
  }
