import { clearAttempts, limitAttempts } from '../attempts.ts'
import { callOf } from '../handleCall.ts'
import type { Opened } from '../opened.ts'

/** A count of tries is written: a read counts nothing and clears nothing. */
const acts = { acts: true }

/** The working object behind the handle `attempts`: it bounds what can be guessed, by a count of the tries of a key. */
export const handle = (_o: Opened): object => ({
  limit: (key: unknown, how: unknown): void => limitAttempts(callOf('`attempts.limit`', acts), key, how),
  clear: (key: unknown, how?: unknown): void => clearAttempts(callOf('`attempts.clear`', acts), key, how),
})
