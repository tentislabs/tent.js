import type { GuardedFetch } from '../connect/index.ts'
import type { History } from '../history/index.ts'
import { fetchedFrom } from './fetchedFrom.ts'
import type { Target } from './target.ts'
import { asked } from './target.ts'

/** A history that follows the history of another server: what asks it at once, and what stops it. */
export interface HistoryFollower {
  // Asks the server it follows at once, as the timer does, and answers when that is done.
  now(): Promise<void>
  close(): void
}

/**
 * Has the history of a reader follow the history of its writer, with the key of the reader: every `every`
 * milliseconds, 10 seconds where none is given, it asks the writer's pointers, fetches the points and the blobs
 * that lead to each and that it lacks, and moves its own pointer of that name there. So a reader that takes over
 * answers a pull with what was pushed to its writer, and goes back with `tent publish --back`. A turn that fails
 * is told to `told`, so that a reader whose history stopped following says so; the next turn tries again.
 */
export function followHistory(o: {
  history: History
  from: Target
  fetch: GuardedFetch
  every?: number
  told?: (line: string) => void
}): HistoryFollower {
  const reaching = { to: o.from, fetch: o.fetch }
  let closed = false
  let busy: Promise<void> | undefined
  const once = async (): Promise<void> => {
    const answer = Object(await asked(reaching, '/_t/sync/have', { points: [], blobs: [], pointers: true }))
    const pointers: Record<string, unknown> = Object(answer.pointers)
    for (const [name, at] of Object.entries(pointers)) {
      if (closed || typeof at !== 'string' || o.history.pointer(name) === at) continue
      if (!o.history.read(at)) {
        const have = Object.values(o.history.pointers()).filter((one) => o.history.read(one) !== undefined)
        await fetchedFrom(reaching, o.history, name, [...new Set(have)])
      }
      if (o.history.read(at)) o.history.move(name, at)
    }
  }
  const turn = (): Promise<void> => {
    busy ??= once()
      .catch((error: unknown) =>
        o.told?.(
          `Following the history of ${o.from.address} failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
      .finally(() => {
        busy = undefined
      })
    return busy
  }
  const timer = setInterval(() => void turn(), o.every ?? 10_000)
  // The program that runs it is held open by its engine: the timer keeps nothing running by itself.
  timer.unref()
  return {
    now: turn,
    close() {
      closed = true
      clearInterval(timer)
    },
  }
}
