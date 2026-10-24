import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/** `app.at`: where this machine stands among the machines of the app. */
export const member =
  (o: Opened): App['at'] =>
  () => {
    heldOpen(o)
    return o.machine.at()
  }
