import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { writeTokens } from '../connections/kept.ts'
import type { State } from '../connections/state.ts'
import { openState } from '../connections/state.ts'
import type { Address } from '../door/address.ts'
import { logCall } from '../door/failure.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { connectEnvOf } from '../services/env.ts'
import { connectNow } from '../services/loaded.ts'
import { errorAnswer } from '../wire.ts'
import { decoded } from '../web/decoded.ts'
import { isStored } from '../../core/internal.ts'

const prefix = '/_t/connect/'

/** Whether a service of an app signs in with the connection of a user: its own `oauth`. */
function oauthOf(o: Opened, name: string): boolean {
  const stored = Object.hasOwn(o.description.services, name) ? o.description.services[name] : undefined
  return isStored(stored?.auth) && isStored(stored.auth.oauth)
}

/** A path of the app with `connect=<word>` after its question mark, in place of one that is there. */
function told(path: string, word?: string): string {
  const url = new URL(path, 'http://app.invalid')
  url.searchParams.delete('connect')
  if (word !== undefined) url.searchParams.set('connect', word)
  return `${url.pathname}${url.search}${url.hash}`
}

/** An answer that sends the browser on, kept by no cache. */
const sentTo = (location: string): Response =>
  new Response(null, {
    status: 302,
    headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  })

/**
 * `GET /_t/connect/<service>`: the return of "connect your account", the address the builder registers with the
 * provider. It passes steps 1 to 4 and 10 of the door, and a key is nobody here. A caller who is nobody is sent to
 * `signInPath` with this address as `back`. The state is held to four things: it opens under this key and this
 * service, it is not older than `limits.connectTime`, its user is the caller, and the request came by the name it
 * holds. Then the code is changed for tokens and the connection is written, and the answer is 302 to `back`. Where
 * any of it fails nothing is written, and the answer is 302 with `connect=failed`, or `connect=refused` where the
 * provider said that the user refused: to the `back` of a state that opened for this caller, and to `/` otherwise.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const { pathname } = new URL(request.url)
    if (request.method !== 'GET' || !pathname.startsWith(prefix)) return false
    const service = decoded(pathname.slice(prefix.length)) ?? ''
    return /^[A-Za-z][A-Za-z0-9]*$/.test(service) && { service, name: '/_t/connect' }
  },
  steps: [1, 2, 3, 4],
  async handle({ app, request, matched, about, caller: found, began }) {
    const service = String(Reflect.get(matched, 'service'))
    // A key reaches nothing here: the return is a browser's.
    const caller: Caller = found.kind === 'key' ? { kind: 'nobody' } : found
    const ended = (answer: Response, error?: unknown): Response => {
      logCall(app, { name: `/_t/connect/${service}`, caller, began, ...(error === undefined ? {} : { error }) })
      return answer
    }
    if (!oauthOf(app, service))
      return ended(
        errorAnswer(
          app,
          '/_t/connect',
          new TentError('T0001', 'No service of this app is connected here.', {
            fix: 'Register the address of a service whose auth is `oauth`: /_t/connect/<service>.',
          }),
        ),
      )
    const url = new URL(request.url)
    if (caller.kind === 'nobody' || !caller.user) {
      const signIn = Reflect.get(Object(app.description.project), 'signInPath')
      const path = typeof signIn === 'string' ? signIn : '/sign-in'
      return ended(sentTo(`${path}?back=${encodeURIComponent(`${url.pathname}${url.search}`)}`))
    }
    const given = url.searchParams.get('state') ?? ''
    const state: State | undefined = openState(app, service, given)
    const reached = `${about.scheme}://${about.host}`
    const now = app.clock.now()
    const mine = state !== undefined && state.user === caller.user.id
    const back = mine ? state.back : '/'
    const fresh =
      state !== undefined && now - state.at <= storedLimit(app.description, 'connectTime') && now >= state.at
    if (!mine || !fresh || state.name !== reached) return ended(sentTo(told(back, 'failed')))
    const error = url.searchParams.get('error')
    if (error !== null) return ended(sentTo(told(back, error === 'access_denied' ? 'refused' : 'failed')))
    const code = url.searchParams.get('code')
    if (!code) return ended(sentTo(told(back, 'failed')))
    try {
      const tokens = await connectNow().tokensFor(connectEnvOf(app), {
        service,
        version: app.version,
        code,
        redirect: `${reached}/_t/connect/${service}`,
        verifier: state.verifier,
      })
      writeTokens(app, { service, user: caller.user.id, account: state.account }, tokens)
      return ended(sentTo(told(back)))
    } catch (failure) {
      return ended(sentTo(told(back, 'failed')), failure)
    }
  },
}
