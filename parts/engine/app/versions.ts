import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { listVersions } from '../versions.ts'

/** `app.versions`: every version of the app that can be loaded, in the order in which they were added. */
export const member =
  (o: Opened): App['versions'] =>
  () => {
    heldOpen(o)
    return listVersions(o)
  }
