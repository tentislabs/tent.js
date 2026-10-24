import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { addVersion, writersOwn } from '../versions.ts'

/**
 * `app.add`: makes one more version loadable, from the folder of its bundle, and answers its id. The running
 * version stays the running one: `app.switch` changes that.
 */
export const member =
  (o: Opened): App['add'] =>
  async (bundleFolder) => {
    heldOpen(o)
    writersOwn(o, 'a version that is added')
    return addVersion(o, bundleFolder)
  }
