import { TentError } from '../../core/index.ts'
import { fingerprintOf } from '../../core/internal.ts'
import { sameSecret } from '../../core/index.ts'

/** The key of the workers that a writer lets join: its id, the key, and what it is bound to where it says so. */
export interface WorkerKey {
  id: string
  key: string
  // The kinds its workers may state, and how many tasks one of them may take at once. Left out, each is free.
  kinds?: string[]
  atOnce?: number
  // How many workers may be joined under it at one time.
  workers: number
  // A key that a row of the keys of the app holds, which may be removed while its workers are joined.
  row?: boolean
}

const keyId = (key: string): string => fingerprintOf(new TextEncoder().encode(key)).slice(0, 16)

/**
 * Takes `workers` of `open`: each entry a key, or `{ key, kinds, atOnce, workers }`. Answers the keys. Throws
 * T0013 for an entry that is no key: a key is a text of 32 characters or more.
 */
export function workerKeysOf(workers: unknown): WorkerKey[] {
  const keys: WorkerKey[] = []
  for (const one of Array.isArray(workers) ? workers : []) {
    const key: unknown = typeof one === 'string' ? one : Reflect.get(Object(one), 'key')
    if (typeof key !== 'string' || key.length < 32)
      throw new TentError('T0013', 'A key of `workers` is a text of 32 characters or more.', {
        fix: "Name each worker's key: `workers: [key, { key, kinds: ['gpu'], atOnce: 4, workers: 2 }]`.",
      })
    const stated = typeof one === 'string' ? {} : Object(one)
    const kinds: unknown = stated.kinds
    keys.push({
      id: keyId(key),
      key,
      ...(Array.isArray(kinds) ? { kinds: kinds.map(String) } : {}),
      ...(typeof stated.atOnce === 'number' ? { atOnce: stated.atOnce } : {}),
      workers: typeof stated.workers === 'number' ? stated.workers : 1,
    })
  }
  return keys
}

/** Answers the key that was sent, comparing every key in constant time, or nothing. */
export function workerKeyIn(keys: WorkerKey[], sent: string): WorkerKey | undefined {
  let found: WorkerKey | undefined
  for (const one of keys) if (sameSecret(sent, one.key)) found = one
  return found
}
