import { TentError } from '../../core/index.ts'
import { countedFor } from '../door/rate.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { countedAs } from '../web/names.ts'

/**
 * Step 4 of the door, for a request for a screen and for a pass: one request is counted for its address, whoever
 * asks, and held to `screensPerMinute`. It is a count of its own, beside the calls of the address. Throws T0005
 * for one request more.
 */
export function screenRequestCounted(o: Opened, from: string): void {
  const limit = limitOf(o.description, 'screensPerMinute')
  if (!countedFor(o, `screens:${countedAs(from)}`, limit))
    throw new TentError('T0005', `More than ${limit} requests for a screen in a minute came from one address.`, {
      fix: 'Ask for fewer screens, or raise `screensPerMinute` in `project.limits`.',
    })
}
