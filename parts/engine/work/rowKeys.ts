import { bearerOf } from '../bearer.ts'
import { keyIn } from '../keys/caller.ts'
import { keyAt } from '../keys/kept.ts'
import type { Opened } from '../opened.ts'
import type { WorkerKey } from './keys.ts'

/**
 * Takes an app and a request. Answers the key of workers that a row of the keys of the app gives: one whose
 * rights hold `work`, bound to what its `work` states, and to one worker where it states no `workers`. Nothing
 * for a request with no such key: a key of the API, and one of another right, lets no worker join.
 */
export function rowWorkerKey(o: Opened, request: Request): WorkerKey | undefined {
  const found = keyIn(o, request)
  if (!found?.key.rights?.includes('work')) return undefined
  const work: Record<string, unknown> = Object(found.key.work)
  return {
    id: found.key.id,
    key: bearerOf(request),
    row: true,
    ...(Array.isArray(work.kinds) ? { kinds: work.kinds.map(String) } : {}),
    ...(typeof work.atOnce === 'number' ? { atOnce: work.atOnce } : {}),
    workers: typeof work.workers === 'number' ? work.workers : 1,
  }
}

/** Whether a key of workers is gone: a row of the keys that was removed, or that has ended. Keys of `open` stay. */
export function keyGone(o: Opened, key: WorkerKey): boolean {
  if (!key.row) return false
  const held = keyAt(o, key.id)?.key
  return !held || (held.expiresAt !== undefined && held.expiresAt.getTime() <= o.clock.now())
}
