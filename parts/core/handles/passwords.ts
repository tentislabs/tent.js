import { member } from '../handle.ts'

/** The handle of passwords. `hash` and `check` answer a promise, and `old` answers at once. */
interface Passwords {
  hash(text: string): Promise<string>
  check(text: string, stored: string): Promise<boolean>
  old(stored: string): boolean
}

export const passwords: Passwords = {
  hash: member('passwords', 'hash'),
  check: member('passwords', 'check'),
  old: member('passwords', 'old'),
}
