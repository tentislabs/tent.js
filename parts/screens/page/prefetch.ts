import type { Reach } from './reach.ts'
import type { Page } from './types.ts'

// How long what was prefetched is kept, and how many prefetches are on their way at once, where the project states
// no other.
const kept = 30_000
const atOnce = 4

/** What a page prefetched for a move: the answer of the engine, once it is there, and when it was asked. */
interface Fetched {
  at: number
  answer: Promise<unknown>
}

/** What prefetches screens for a move, and hands a move what it fetched. */
export interface Prefetch {
  // Asks for the screen of a path before the move, once, unless the connection saves data or four are on their way.
  fetch(path: string, version: string): void
  // What was fetched for a path within the time it is kept, which is then no longer kept.
  take(path: string): Promise<unknown> | undefined
}

/**
 * Takes the reach of a page, the page that is shown, and what is told each answer that came, so that the files of
 * its screen are loaded before the move too. Answers what prefetches screens: the actions of a screen's `data` are
 * not called in a prefetch, so a move asks once more for a screen whose answer left one open.
 */
export function prefetchOf(reach: Reach, shown: () => Page, came: (answer: unknown) => void): Prefetch {
  const fetched = new Map<string, Fetched>()
  let going = 0
  const now = (): number => reach.now?.() ?? Date.now()
  return {
    fetch(path, version) {
      const held = fetched.get(path)
      if (held && now() - held.at < (shown().prefetchKept ?? kept)) return
      if (!reach.get || going >= (shown().prefetchAtOnce ?? atOnce) || reach.saving?.() === true) return
      going += 1
      const answer = reach
        .get(`/_t/screen?path=${encodeURIComponent(path)}&version=${encodeURIComponent(version)}&prefetch=1`)
        .catch(() => undefined)
        .finally(() => {
          going -= 1
        })
      // The ask goes out at once; what it brings is taken in when the browser is idle, and a move that comes first
      // takes the answer itself.
      void answer.then((wire) => (reach.idle ?? ((work: () => void) => work()))(() => came(wire)))
      fetched.set(path, { at: now(), answer })
    },
    take(path) {
      const held = fetched.get(path)
      fetched.delete(path)
      return held && now() - held.at < (shown().prefetchKept ?? kept) ? held.answer : undefined
    },
  }
}
