import type { Opened } from './opened.ts'
import { cacheWrote } from './pages/cache.ts'

/**
 * Takes an app of which something that any read may depend on changed, which no write names: a setting, or its
 * data written from outside the engine. Every live group is run again, and the cache of public screens is emptied.
 */
export function readAllAgain(o: Opened): void {
  o.hub?.wrote([], true)
  cacheWrote(o, [], true)
}
