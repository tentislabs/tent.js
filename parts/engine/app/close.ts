import type { App } from '../app.ts'
import { closeApp } from '../open.ts'
import type { Opened } from '../opened.ts'

/** `app.close`: closes this app only, and for good. A second closing does nothing. */
export const member =
  (o: Opened): App['close'] =>
  async () => {
    await closeApp(o)
  }
