import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { dropVersion, writersOwn } from '../versions.ts'

/** `app.drop`: a version that is neither running nor needed can no longer be loaded. Answers whether it was dropped. */
export const member =
  (o: Opened): App['drop'] =>
  async (version) => {
    heldOpen(o)
    writersOwn(o, 'a version that is dropped')
    return dropVersion(o, version)
  }
