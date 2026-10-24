import { later, TentError } from '../../core/index.ts'
import { rowIds } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { callerWritten } from '../program.ts'
import { newApiKey } from './form.ts'
import type { KeyRow } from './kept.ts'
import { isStored } from '../../core/internal.ts'

const bad = (words: string, field: string, check = 'type'): TentError =>
  new TentError('T0002', words, { fields: { [field]: check } })

/** A list of names as a key holds it: texts, each once. */
function namesOf(given: unknown, field: string): string[] {
  if (given === undefined) return []
  if (!Array.isArray(given) || given.some((one) => typeof one !== 'string' || one === ''))
    throw bad(`\`${field}\` of a key is a list of names.`, field)
  return [...new Set(given.map(String))]
}

/** What a key of the right `work` is bound to: the kinds its workers may state, how many tasks one takes at once, and how many may be joined. */
function workOf(given: unknown, rights: string[]): Record<string, unknown> {
  if (!rights.includes('work')) throw bad('`work` of a key binds a key of the right `work` alone.', 'work')
  if (!isStored(given) || Object.keys(given).some((one) => !['kinds', 'atOnce', 'workers'].includes(one)))
    throw bad('`work` of a key is `{ kinds, atOnce, workers }`.', 'work')
  const whole = (field: string): number | undefined => {
    const value = given[field]
    if (value === undefined) return undefined
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
      throw bad(`\`work.${field}\` of a key is a whole number of 1 or more.`, `work.${field}`)
    return value
  }
  const [atOnce, workers] = [whole('atOnce'), whole('workers')]
  return {
    ...(given.kinds === undefined ? {} : { kinds: namesOf(given.kinds, 'work.kinds') }),
    ...(atOnce === undefined ? {} : { atOnce }),
    ...(workers === undefined ? {} : { workers }),
  }
}

/** A key as `keys.add` is handed it, held to its fields. Throws T0002 for one that does not fit, T2103 for a user of no row. */
function keyFrom(o: Opened, given: unknown, id: string): KeyRow {
  if (!isStored(given)) throw bad('`keys.add` takes a record: `{ name, scopes, roles, user, perMinute, for }`.', '')
  if (typeof given.name !== 'string' || given.name.trim() === '') throw bad('A key has a `name`.', 'name', 'required')
  const user = given.user === undefined ? undefined : String(given.user)
  const roles = namesOf(given.roles, 'roles')
  if (user !== undefined && roles.length)
    throw bad('A key that is made for a user has the roles of that user, and takes no `roles` of its own.', 'roles')
  if (user !== undefined) callerWritten(o, user)
  const perMinute = given.perMinute === undefined ? 600 : Number(given.perMinute)
  if (!Number.isInteger(perMinute) || perMinute < 1)
    throw bad('`perMinute` of a key is a whole number of 1 or more.', 'perMinute')
  if (given.asks !== undefined && given.asks !== 'none') throw bad("`asks` of a key is `'none'`, or left out.", 'asks')
  const now = new Date(o.clock.now())
  let expiresAt: Date | undefined
  if (given.for !== undefined) {
    expiresAt = typeof given.for === 'string' ? later(now, given.for) : undefined
    if (!expiresAt || !(expiresAt.getTime() > now.getTime()))
      throw bad("`for` of a key is a length of time, as `'90 days'`.", 'for')
  }
  const rights = given.rights === undefined ? undefined : namesOf(given.rights, 'rights')
  return {
    id,
    name: given.name,
    scopes: namesOf(given.scopes, 'scopes'),
    roles,
    ...(user === undefined ? {} : { user }),
    perMinute,
    ...(given.asks === 'none' ? { asks: 'none' } : {}),
    ...(rights === undefined ? {} : { rights }),
    ...(given.work === undefined ? {} : { work: workOf(given.work, rights ?? []) }),
    createdAt: now,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

/** A key as a list shows it: what it carries, and neither its rights nor its work. */
export type Shown = Omit<KeyRow, 'rights' | 'work'>

export const shownOf = (key: KeyRow): Shown => ({
  id: key.id,
  name: key.name,
  scopes: key.scopes,
  roles: key.roles,
  ...(key.user === undefined ? {} : { user: key.user }),
  perMinute: key.perMinute,
  ...(key.asks === undefined ? {} : { asks: key.asks }),
  createdAt: key.createdAt,
  ...(key.lastUsedAt ? { lastUsedAt: key.lastUsedAt } : {}),
  ...(key.expiresAt ? { expiresAt: key.expiresAt } : {}),
})

/**
 * Takes an app and what a key is made with: `{ name, scopes, roles, user, perMinute, for, asks, rights, work }`.
 * Answers its row, the key itself, which is shown once, and the fingerprint that is kept of it. Throws T0002 for
 * a field that does not fit, and T2103 for a user of no row.
 */
export function madeKey(o: Opened, given: unknown): { row: KeyRow; key: string; fingerprint: string } {
  const id = rowIds.next()
  const row = keyFrom(o, given, id)
  // The workers of a key of the right `work` join over the link, which an app that let none join has not loaded.
  if (row.rights?.includes('work')) void o.work?.linkable()
  return { row, ...newApiKey(id) }
}
