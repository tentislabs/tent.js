import { TentError } from '../../core/index.ts'
import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { failuresShown } from '../failed/held.ts'

/**
 * `app.show`: in the mode `development`, what the open pages show as an overlay: the findings of the build and of
 * the check. They stand for a page that opens later too, and an empty list takes the overlay away. Throws T0013
 * in any other mode.
 */
export const member =
  (o: Opened): App['show'] =>
  (findings) => {
    heldOpen(o)
    if (o.mode !== 'development')
      throw new TentError('T0013', 'Findings are shown on the pages of an app in development, and on no other.', {
        fix: 'Open the app in the mode `development`, as `tent dev` does.',
      })
    o.findings = [...findings]
    o.hub?.show(failuresShown(o))
  }
