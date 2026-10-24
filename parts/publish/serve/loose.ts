import type { App } from '../../engine/index.ts'
import type { Point } from '../../history/index.ts'
import { syncLimit } from '../limits.ts'
import { refusedPush } from './merged.ts'

/** The blobs that a server took and that no point names yet, which it holds to `syncLooseSize`. */
export interface Loose {
  // Takes blobs that were sent. Throws T9103 where they would pass the bound.
  add(app: App, blobs: [string, Uint8Array][]): void
  // Points that arrived name their blobs, which are loose no more.
  named(points: Point[]): void
  // What `tidy` removed: the count starts again.
  tidied(): void
}

/** A count of the loose blobs of one server, kept while it runs. The files of a bundle are not counted. */
export function looseBlobs(): Loose {
  const sizes = new Map<string, number>()
  let total = 0
  return {
    add(app, blobs) {
      const most = syncLimit(app.description, 'syncLooseSize')
      const adding = blobs.filter(([print]) => !sizes.has(print))
      const more = adding.reduce((sum, [, bytes]) => sum + bytes.length, 0)
      if (total + more > most)
        throw refusedPush(
          `The server holds ${total} bytes of blobs that no point names, and takes ${most} at most.`,
          { reason: 'loose', count: String(sizes.size) },
          'Push the points that name the blobs you sent, or wait for the daily upkeep of the server.',
        )
      for (const [print, bytes] of adding) sizes.set(print, bytes.length)
      total += more
    },
    named(points) {
      for (const point of points)
        for (const print of [...Object.values(point.files ?? {}), ...(point.description ? [point.description] : [])]) {
          total -= sizes.get(print) ?? 0
          sizes.delete(print)
        }
    },
    tidied() {
      sizes.clear()
      total = 0
    },
  }
}
