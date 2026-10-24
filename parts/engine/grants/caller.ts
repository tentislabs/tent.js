import type { Caller } from '../../core/index.ts'
import { fits, sentKey } from '../keys/form.ts'
import type { Opened } from '../opened.ts'
import { callerWritten } from '../program.ts'
import { visit } from '../visit.ts'
import type { GrantRow } from './kept.ts'
import { changeGrant, grantAt } from './kept.ts'

/** The caller that a grant is: the user who gave it, with the roles of today, narrowed by what was granted. */
export function grantCaller(o: Opened, grant: GrantRow): Caller | undefined {
  try {
    const { user } = callerWritten(o, grant.user)
    return user
      ? { kind: 'mcp', user, grant: { id: grant.id, client: grant.client, scopes: grant.scopes, for: grant.for } }
      : undefined
  } catch {
    // A grant of a user whose row is gone is nobody.
    return undefined
  }
}

/** Writes when a grant was last used: once a minute at most, by the writer, which a reader tells of a use. */
function noteUse(o: Opened, grant: GrantRow): void {
  const now = o.clock.now()
  if (now - grant.usedAt.getTime() < 60_000) return
  if (o.machine.reader) {
    const here = visit()
    if (here) here.due = true
    return
  }
  o.store.write((tx) => changeGrant(tx, grant.id, { usedAt: new Date(now) }))
}

/**
 * Takes an app and a request. Answers the grant whose access token the request sends in `Authorization: Bearer`,
 * with its caller, where the token fits, has not ended, and its user is there; its use is noted once a minute at
 * most. Nothing for a request that sends none, and for a token that does not fit or has ended: that caller is nobody.
 */
export function tokenIn(o: Opened, request: Request): { grant: GrantRow; caller: Caller } | undefined {
  const sent = sentKey(request)
  if (!sent) return undefined
  const grant = grantAt(o, sent.id)
  if (!fits(sent.random, grant?.access) || !grant) return undefined
  if (grant.accessExpiresAt.getTime() <= o.clock.now()) return undefined
  const caller = grantCaller(o, grant)
  if (!caller) return undefined
  noteUse(o, grant)
  return { grant, caller }
}

/** The caller of a token given for the whole app, under the name of the app it was asked for, as the live connection reads one. */
export function appTokenIn(o: Opened, request: Request, origin: string): { caller: Caller } | undefined {
  const found = tokenIn(o, request)
  return found?.grant.for === 'app' && found.grant.resource === origin ? { caller: found.caller } : undefined
}
