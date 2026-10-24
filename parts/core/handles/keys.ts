import { member } from '../handle.ts'

/** What a key is made with. */
interface KeyOptions {
  name: string
  scopes?: readonly string[]
  roles?: readonly string[]
  user?: string
  perMinute?: number
  for?: string
  asks?: string
  rights?: readonly string[]
}

/** The handle of the keys of programs. Every member answers at once. */
interface Keys {
  add(o: KeyOptions): { id: string; key: string }
  list(o?: { user?: string }): { id: string; name: string; scopes: string[]; roles: string[]; user?: string }[]
  remove(id: string): void
}

export const keys: Keys = {
  add: member('keys', 'add'),
  list: member('keys', 'list'),
  remove: member('keys', 'remove'),
}
