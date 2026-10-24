import { member } from '../handle.ts'

/** The handle that bounds what can be guessed. Every member answers at once. */
interface Attempts {
  limit(key: string, o: { tries: number; per: string; address?: boolean }): void
  clear(key: string, o?: { address?: boolean }): void
}

export const attempts: Attempts = {
  limit: member('attempts', 'limit'),
  clear: member('attempts', 'clear'),
}
