import { TentError } from '../../core/index.ts'
import type { App } from '../app.ts'
import { openedOf } from '../app.ts'
import { heldOpen } from '../opened.ts'
import type { KeyRow } from './kept.ts'
import { addKey } from './kept.ts'
import { madeKey } from './made.ts'

/**
 * Takes an app and what a key is made with, as `keys.add` takes it. Makes the key, as the system does, and answers
 * its row and the key itself: it is how `app.key` of the test helpers makes a caller. Throws T0002 for a field that
 * does not fit, and T0013 for an app that is closed.
 */
export function writeKey(app: App, given: object): { row: KeyRow; key: string } {
  const o = openedOf(app)
  if (!o) throw new TentError('T0013', 'A key is written into an app that an engine opened.')
  heldOpen(o)
  const made = madeKey(o, { name: 'a key of a test', ...given })
  o.store.write((tx) => addKey(tx, made.row, made.fingerprint))
  return { row: made.row, key: made.key }
}
