import { TentError } from '../../core/index.ts'
import { fingerprintOf } from '../../core/internal.ts'
import { sameSecret } from '../../core/index.ts'

/** The key of one reader, as a writer holds it: its id, the key, and whether it holds the right `far` alone. */
export interface ReaderKey {
  id: string
  key: string
  far: boolean
}

/** The id of a key: the first 16 characters of its fingerprint. */
const keyId = (key: string): string => fingerprintOf(new TextEncoder().encode(key)).slice(0, 16)

/**
 * Takes `readers` of `open`: each entry a key, or a key that is far. Answers the keys. Throws T0013 for an entry
 * that is no key: a key is a text of 32 characters or more.
 */
export function readerKeysOf(readers: unknown): ReaderKey[] {
  const keys: ReaderKey[] = []
  for (const one of Array.isArray(readers) ? readers : []) {
    const key: unknown = typeof one === 'string' ? one : Reflect.get(Object(one), 'key')
    if (typeof key !== 'string' || key.length < 32)
      throw new TentError('T0013', 'A key of `readers` is a text of 32 characters or more.', {
        fix: "Name each reader's key: `readers: [key, { key, far: true }]`.",
      })
    keys.push({ id: keyId(key), key, far: typeof one !== 'string' && Reflect.get(Object(one), 'far') === true })
  }
  return keys
}

/**
 * Takes the keys of a writer and a key that was sent. Answers the key it is, or nothing. Each key is compared by
 * its fingerprint, in constant time, and every key is compared, whichever fits.
 */
export function readerKeyIn(keys: ReaderKey[], sent: string): ReaderKey | undefined {
  let found: ReaderKey | undefined
  for (const one of keys) if (sameSecret(sent, one.key)) found = one
  return found
}
