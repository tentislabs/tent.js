import { TentError } from '../../core/index.ts'
import { isPath, isStored, proofOf } from '../../core/internal.ts'
import { connectionsOf, tokensOf, writeTokens } from '../connections/kept.ts'
import { sealState } from '../connections/state.ts'
import type { CallContext } from '../context.ts'
import { hasFullAccess } from '../full.ts'
import { callOf } from '../handleCall.ts'
import type { Opened } from '../opened.ts'
import { connectEnvOf } from '../services/env.ts'
import { connectNow } from '../services/loaded.ts'
import { visit } from '../visit.ts'

/** The name of the service that code handed a member: the service itself, or its name. */
function serviceIn(o: Opened, service: unknown): string {
  const name = typeof service === 'string' ? service : Reflect.get(Object(service), 'definition')
  if (typeof name !== 'string' || !Object.hasOwn(o.description.services, name))
    throw new TentError('T0002', 'A member of `connections` is handed a service of the app.', {
      fields: { service: 'type' },
      fix: 'Hand it the service itself, as it is imported: `connections.start(github)`.',
    })
  return name
}

/** The user that a member names: the caller's own, or another in code with full access (T0013 without). */
function userOf(cx: CallContext, member: string, named: unknown): string | undefined {
  const own = cx.caller.user?.id
  if (named === undefined || named === own) return own
  if (typeof named !== 'string' || !hasFullAccess(cx))
    throw new TentError(
      'T0013',
      `${cx.work.name} used \`connections.${member}\` for another user, which is full access.`,
      {
        fix: "Name the user of the call, or state `system: 'why'` on the definition.",
      },
    )
  return named
}

/**
 * `connections.start`: answers the address of the provider that the user is sent to, with a state that travels
 * with the user and is kept nowhere. Throws T0006 for a caller who is nobody, T0013 for one that is no user (a key
 * of nobody, the system) and where no request names the address the user comes back to, and T0002 for a `back`
 * that is no path of the app.
 */
function start(o: Opened, service: unknown, how: unknown): string {
  const cx = callOf('`connections.start`', { acts: true })
  const name = serviceIn(o, service)
  const user = cx.caller.user?.id
  if (cx.caller.kind === 'nobody')
    throw new TentError('T0006', 'Connecting an account needs a signed-in user.', { fix: 'Sign the user in first.' })
  if (user === undefined)
    throw new TentError('T0013', `\`connections.start\` was used by a caller who is no user: ${cx.caller.kind}.`, {
      fix: 'Start a connection for a signed-in user, or with a key that was made for a user.',
    })
  const given = isStored(how) ? how : {}
  const back = given.back === undefined ? '/' : given.back
  if (typeof back !== 'string' || !isPath(back))
    throw new TentError('T0002', '`back` of `connections.start` is a path of the app.', {
      fields: { back: 'path' },
      fix: "Name a path of the app, as '/settings'.",
    })
  const account = typeof given.account === 'string' ? given.account : ''
  const about = visit()?.about
  if (!about)
    throw new TentError('T0013', '`connections.start` was used with no request that names where the user comes back.', {
      fix: 'Start a connection from a call of a page or of a program.',
    })
  const reached = `${about.scheme}://${about.host}`
  const { verifier, challenge } = proofOf()
  const state = sealState(o, name, { user, account, back, verifier, name: reached, at: o.clock.now() })
  return connectNow().connectAddress(connectEnvOf(o), {
    service: name,
    version: cx.version,
    state,
    redirect: `${reached}/_t/connect/${name}`,
    challenge,
  })
}

/** `connections.list`: the connections of the caller's own, or of another user in code with full access. A read. */
function list(o: Opened, user: unknown): { service: string; account: string; scopes: string[]; at: Date }[] {
  const cx = callOf('`connections.list`')
  const id = userOf(cx, 'list', user)
  if (id === undefined) return []
  const open = cx.writing ? cx.writing.tx() : cx.tx
  return connectionsOf(o, { user: id, ...(open ? { tx: open } : {}) })
    .sort((a, b) => a.at.getTime() - b.at.getTime() || (a.service < b.service ? -1 : 1))
    .map(({ service, account, scopes, at }) => ({ service, account, scopes, at }))
}

/**
 * `connections.end`: removes a connection of the caller's own, or of another user in code with full access. Where
 * the service states `revokeUrl` the tokens are posted there first, and it answers a promise; otherwise it is part
 * of the write of a change it is used in.
 */
function end(o: Opened, service: unknown, how: unknown): undefined | Promise<void> {
  const name = serviceIn(o, service)
  const stored = o.description.services[name]
  const owner = typeof stored.connection === 'string' && stored.connection !== '' ? stored.connection : name
  const auth = isStored(o.description.services[owner]?.auth) ? o.description.services[owner].auth : {}
  const revokes = isStored(auth) && isStored(auth.oauth) && typeof auth.oauth.revokeUrl === 'string'
  const cx = callOf('`connections.end`', { acts: true, waits: revokes })
  const given = isStored(how) ? how : {}
  const user = userOf(cx, 'end', given.user)
  if (user === undefined) return revokes ? Promise.resolve() : undefined
  const where = { service: owner, user, account: typeof given.account === 'string' ? given.account : '' }
  if (!revokes) {
    writeTokens(o, where, undefined, cx.writing ? cx.writing.tx() : cx.tx)
    return undefined
  }
  return (async () => {
    const tokens = tokensOf(o, where.service, where.user, where.account)
    if (tokens) await connectNow().revoke(connectEnvOf(o), { service: name, version: cx.version, tokens })
    writeTokens(o, where, undefined)
  })()
}

/** The working object behind the handle `connections`. */
export const handle = (o: Opened): object => ({
  start: (service: unknown, how?: unknown) => start(o, service, how),
  list: (user?: unknown) => list(o, user),
  end: (service: unknown, how?: unknown) => end(o, service, how),
})
