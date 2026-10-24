import { TentError } from '../../core/index.ts'
import type { Tx } from '../../data/index.ts'
import type { CallContext } from '../context.ts'
import { hasFullAccess } from '../full.ts'
import type { GrantRow } from '../grants/kept.ts'
import { grantAt, grantsOf, removeGrant } from '../grants/kept.ts'
import { callOf } from '../handleCall.ts'
import { streamsEnded } from '../mcp/kept.ts'
import type { Opened } from '../opened.ts'

/** A grant as `grants.list` answers it: nothing of its tokens. */
const shownOf = (one: GrantRow): Record<string, unknown> => ({
  id: one.id,
  client: one.client,
  name: one.name,
  scopes: one.scopes,
  for: one.for,
  createdAt: one.createdAt,
  usedAt: one.usedAt,
  ...(one.reusedAt ? { reusedAt: one.reusedAt } : {}),
})

/** The user of the caller of a call, where it is one. */
const ownUser = (cx: CallContext): string | undefined => cx.caller.user?.id

/** The write that is open in the call, where one is. */
const openIn = (cx: CallContext): Tx | undefined => (cx.writing ? cx.writing.tx() : cx.tx)

/**
 * The working object behind the handle `grants`: what people allowed programs. `list()` answers the caller's own,
 * at once; with full access `list(user)` answers any user's (T0013 without). `end(id)` ends one of the caller's
 * own, and with full access any; it writes, so it works where a change or an action does.
 */
export const handle = (o: Opened): object => ({
  list(user?: unknown): Record<string, unknown>[] {
    const cx = callOf('`grants.list`')
    const own = ownUser(cx)
    if (user !== undefined && user !== own && !hasFullAccess(cx))
      throw new TentError('T0013', `${cx.work.name} used \`grants.list\` for another user than its caller.`, {
        fix: "Name no user for the caller's own, or state `system: 'why'` on the definition.",
      })
    const whose = typeof user === 'string' ? user : own
    return whose === undefined ? [] : grantsOf(o, whose, openIn(cx)).map(shownOf)
  },
  end(id: unknown): void {
    const cx = callOf('`grants.end`', { acts: true })
    const grant = typeof id === 'string' ? grantAt(o, id, openIn(cx)) : undefined
    // Another person's grant is no grant of the caller's to end, but in code with full access.
    if (!grant || (grant.user !== ownUser(cx) && !hasFullAccess(cx))) return
    const tx = openIn(cx)
    if (tx) removeGrant(tx, grant.id)
    else o.store.write((open) => removeGrant(open, grant.id))
    streamsEnded(o, `grant:${grant.id}`)
  },
})
