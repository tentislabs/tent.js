import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/**
 * `app.export`: writes the site out as files for any host of files, from a release build, as nobody. Answers the
 * address of each page it wrote, what it left out with the reason, and its warnings.
 */
export const member =
  (o: Opened): App['export'] =>
  async (folder, how) => {
    heldOpen(o)
    // The writing of a site is loaded with the first export: an app that makes none loads nothing of it.
    const { exportOf } = await import('../export/export.ts')
    return exportOf(o, folder, how)
  }
