import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/**
 * `app.shot`: a picture of a screen, as nobody or as the user that `as` names, taken by a browser of the Chromium
 * family that the engine drives. Answers where the picture was written, its size, and the status of the screen.
 */
export const member =
  (o: Opened): App['shot'] =>
  async (path, how) => {
    heldOpen(o)
    // The driving of a browser is loaded with the first picture: an app that takes none loads nothing of it.
    const { shotOf } = await import('../shot/shot.ts')
    return shotOf(o, path, how)
  }
