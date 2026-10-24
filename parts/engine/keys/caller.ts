import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { callerWritten } from '../program.ts'
import { visit } from '../visit.ts'
import { fits, sentKey } from './form.ts'
import type { KeyRow } from './kept.ts'
import { keyAt, noteUse } from './kept.ts'

/** The caller that a key is: signed in with its roles, or the user it was made for, with the roles of today. */
export function keyCaller(o: Opened, key: KeyRow): Caller | undefined {
  const base = { id: key.id, scopes: key.scopes, ...(key.rights ? { rights: key.rights } : {}) }
  if (key.user === undefined) return { kind: 'key', key: { ...base, roles: key.roles } }
  try {
    const { user } = callerWritten(o, key.user)
    return user ? { kind: 'key', user, key: { ...base, roles: user.roles } } : undefined
  } catch {
    // A key of a user whose row is gone is nobody.
    return undefined
  }
}

/** Whether a caller is a key that states `asks: 'none'`: the builder's word that it needs no person. */
export const asksNobody = (o: Opened, caller: Caller): boolean =>
  caller.kind === 'key' && caller.key !== undefined && keyAt(o, caller.key.id)?.key.asks === 'none'

/**
 * Takes an app and a request. Answers the key that the request sends in `Authorization: Bearer`, with its caller,
 * where the key is there, fits, and has not ended; its use is noted once a minute at most. Nothing for a request
 * that sends none, and for a key that is not there, is removed, does not fit, or has ended: that caller is nobody.
 */
export function keyIn(o: Opened, request: Request): { key: KeyRow; caller: Caller } | undefined {
  const sent = sentKey(request)
  if (!sent) return undefined
  const held = keyAt(o, sent.id)
  if (!fits(sent.random, held?.fingerprint) || !held) return undefined
  const { key } = held
  if (key.expiresAt && key.expiresAt.getTime() <= o.clock.now()) return undefined
  const caller = keyCaller(o, key)
  if (!caller) return undefined
  // The writer alone writes: a reader hands a request on whose key is due to be noted, as one of a session.
  if (!o.machine.reader) noteUse(o, key)
  else if (!key.lastUsedAt || o.clock.now() - key.lastUsedAt.getTime() >= 60_000) {
    const here = visit()
    if (here) here.due = true
  }
  return { key, caller }
}
