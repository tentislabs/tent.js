import { rowIds } from '../../data/index.ts'
import { fits, newApiKey, readKey } from '../keys/form.ts'
import { storedLimit } from '../limits.ts'
import { streamsEnded } from '../mcp/kept.ts'
import type { Opened } from '../opened.ts'
import type { Allowed } from './codes.ts'
import type { GrantRow } from './kept.ts'
import { addGrant, changeGrant, grantAt, removeGrant } from './kept.ts'

/** The two tokens of a grant, as the token address answers them in the standard's form. */
export interface Pair {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

/** A new pair of tokens for a grant, with the fingerprints that its row keeps of them. */
function pairOf(o: Opened, grant: { id: string; scopes: string[] }): { pair: Pair; access: string; refresh: string } {
  const access = newApiKey(grant.id)
  const refresh = newApiKey(grant.id)
  return {
    pair: {
      access_token: access.key,
      token_type: 'Bearer',
      expires_in: Math.round(storedLimit(o.description, 'tokenTime') / 1000),
      refresh_token: refresh.key,
      scope: grant.scopes.join(' '),
    },
    access: access.fingerprint,
    refresh: refresh.fingerprint,
  }
}

/** The moments that a new pair moves on: the end of its access token, and the end of the grant from this use. */
function moments(o: Opened): { accessExpiresAt: Date; expiresAt: Date } {
  const now = o.clock.now()
  return {
    accessExpiresAt: new Date(now + storedLimit(o.description, 'tokenTime')),
    expiresAt: new Date(now + storedLimit(o.description, 'grantTime')),
  }
}

/** Makes the grant of what a person allowed, and answers its id and its first pair of tokens. */
export function grantMade(o: Opened, allowed: Allowed): { id: string; pair: Pair } {
  const id = rowIds.next()
  const made = pairOf(o, { id, scopes: allowed.scopes })
  const now = new Date(o.clock.now())
  const row: GrantRow = {
    id,
    user: allowed.user,
    client: allowed.client,
    name: allowed.name,
    resource: allowed.resource,
    scopes: allowed.scopes,
    access: made.access,
    refresh: made.refresh,
    for: allowed.for,
    createdAt: now,
    usedAt: now,
    ...moments(o),
  }
  o.store.write((tx) => addGrant(tx, row))
  return { id, pair: made.pair }
}

/** Ends a grant: its row is removed at once, and its kept streams are closed. */
export function grantEnded(o: Opened, id: string): void {
  o.store.write((tx) => removeGrant(tx, id))
  streamsEnded(o, `grant:${id}`)
}

/**
 * A renewal: a renewal token of the client of its grant gives a new pair and ends the old one. The one before the
 * present one, used again within `renewGrace` and once only, is given a pair once more, which takes the place of
 * the present one, and the row notes it: the renewal token of the pair it replaced is then the one before, and
 * ends the grant at its next use. Used again any later, it ends the whole grant. Answers the pair, or nothing for
 * a refusal.
 */
export function renewal(o: Opened, written: string, client: string): Pair | undefined {
  const sent = readKey(written)
  const grant = sent ? grantAt(o, sent.id) : undefined
  if (!sent || !grant || grant.client !== client) return undefined
  const now = o.clock.now()
  if (fits(sent.random, grant.refresh)) {
    const made = pairOf(o, grant)
    o.store.write((tx) =>
      changeGrant(tx, grant.id, {
        access: made.access,
        refresh: made.refresh,
        refreshBefore: grant.refresh,
        renewedAt: new Date(now),
        ...moments(o),
      }),
    )
    return made.pair
  }
  if (!fits(sent.random, grant.refreshBefore)) return undefined
  const renewedAt = grant.renewedAt?.getTime() ?? 0
  const once = grant.reusedAt === undefined || grant.reusedAt.getTime() < renewedAt
  if (once && now - renewedAt <= storedLimit(o.description, 'renewGrace')) {
    const made = pairOf(o, grant)
    o.store.write((tx) =>
      changeGrant(tx, grant.id, {
        access: made.access,
        refresh: made.refresh,
        refreshBefore: grant.refresh,
        reusedAt: new Date(now),
        ...moments(o),
      }),
    )
    return made.pair
  }
  // One of the two who hold the grant is not its client: neither keeps it.
  grantEnded(o, grant.id)
  return undefined
}

/** Ends the grant of a renewal token that is handed in, as `logout` does. Answers whether it ended one. */
export function endedBy(o: Opened, written: string): boolean {
  const sent = readKey(written)
  const grant = sent ? grantAt(o, sent.id) : undefined
  if (!sent || !grant || !(fits(sent.random, grant.refresh) || fits(sent.random, grant.access))) return false
  grantEnded(o, grant.id)
  return true
}
