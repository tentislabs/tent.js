import { TentError } from '../../core/index.ts'
import { bounded } from '../bounded.ts'
import { endsAt } from '../endsAt.ts'
import type { CallContext, Work } from '../context.ts'
import { within } from '../context.ts'
import type { Address } from '../door/address.ts'
import { called } from '../door/call.ts'
import { allows, waitingDb } from '../door/carry.ts'
import { logCall, refusedCall } from '../door/failure.ts'
import { callerOf, refusedBy, ruled } from '../door/rule.ts'
import { inScope } from '../door/scopes.ts'
import { inGrant } from '../grants/scoped.ts'
import { keepBytes } from '../incoming/kept.ts'
import type { RouteFound } from '../routes.ts'
import { callIn } from '../rooms/calls.ts'
import { routeAt, routeCode, routeSites, routeSize, routeTime } from '../routes.ts'
import { visit } from '../visit.ts'
import { errorAnswer } from '../wire.ts'
import { countAnswered, countAnswering } from '../counts/screens.ts'
import { noteTouched } from '../touched.ts'

/** A request whose bytes are read and kept for `verified`, handed on with the same bytes as its body. */
async function keptRequest(request: Request): Promise<Request> {
  const bytes = new Uint8Array(await request.arrayBuffer())
  const again = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: bytes }),
  })
  keepBytes(again, bytes)
  return again
}

const isFound = (matched: object): matched is RouteFound & { name: string } =>
  typeof Reflect.get(matched, 'name') === 'string' && typeof Reflect.get(matched, 'record') === 'object'

/**
 * An address that a `route` of the project answers, with the response of the builder's own code. It passes steps
 * 1 to 6 and 10 of the door: the size and the origin, with the size and the sites that the route states, the
 * caller, the rate limits, and its `access`, where a rule made with `allow` is handed the request and the values
 * of its path. A request for its path with a method that it does not state is no request for it. A refusal of
 * the door is the wire error, and an error that `run` throws is T0009.
 */
export const address: Address = {
  order: 3,
  match(request) {
    const o = visit()?.app
    return (o && routeAt(o, request.method, new URL(request.url).pathname)) ?? false
  },
  steps: [1, 2, 3, 4, 10],
  own: (o, matched) =>
    isFound(matched) ? { size: routeSize(o, matched.record), sites: routeSites(matched.record) } : undefined,
  async handle({ app: o, request, matched, caller, about, began }) {
    if (!isFound(matched)) return errorAnswer(o, 'route', new TentError('T0001', 'No route answers this address.'))
    const { name, record, params } = matched
    noteTouched('routes', name)
    countAnswering(name, caller)
    const work: Work = {
      name,
      // A route works as an action does: it may wait, and its `db` answers promises.
      kind: 'action',
      depth: 1,
      now: new Date(o.clock.now()),
      ends: performance.now() + routeTime(o, record),
    }
    const ends = new AbortController()
    const cx: CallContext = { app: o, version: o.version, caller, made: 0, signal: ends.signal, work }
    let cancel = (): void => undefined
    try {
      // A key reaches a route only where its scopes name it.
      inScope(caller, name)
      inGrant(o, caller, name, false)
      const code = routeCode(o, name)
      if (!code)
        throw new TentError('T0011', `The route ${name} is code, and the bundle holds no \`run\` for it.`, {
          fix: 'Build the project again, and run the bundle as the build wrote it.',
        })
      const asked =
        record.verified === true
          ? await keptRequest(bounded(request, routeSize(o, record)))
          : bounded(request, routeSize(o, record))
      // Step 6: the rule of the route. One made with `allow` is asked here, since a route has no checked input.
      const said = ruled(record.access, caller)
      const denied = (rule: string, needs: string): TentError => {
        o.log.write('denied', { at: o.clock.now(), name, ...callerOf(caller), rule })
        return refusedBy(name, needs, caller)
      }
      if ('needs' in said) throw denied(said.rule, said.needs)
      const access: Record<string, unknown> = Object(record.access)
      if (
        said.says === 'asks' &&
        !allows(o, cx, { access, input: { request: asked, params }, ...(code.access ? { arrow: code.access } : {}) })
      )
        throw denied(said.rule, 'needs a caller that its rule lets in')
      const call = (fn: unknown, handed?: unknown): unknown =>
        called(o, String(Reflect.get(Object(fn), 'definition')), handed, { caller: { kind: 'system' }, parent: cx })
      const handed = {
        request: asked,
        params,
        user: caller.kind === 'system' ? undefined : caller.user,
        db: waitingDb(o, cx),
        about: { from: about.from, origin: about.origin },
        ...(typeof record.system === 'string' ? { call } : {}),
      }
      // The end of the work may move while it runs: the wait for a part that is fetched is taken out of its time.
      const timing = endsAt(work, () => {
        ends.abort()
        return new TentError('T0008', `${name} worked past the time of its call.`, {
          fix: 'Do less in one request, or raise `limits.time` of the route.',
        })
      })
      cancel = timing.cancel
      const { timeUp } = timing
      const answer = await Promise.race([
        within(cx, async () => callIn(cx, o.room, code.run, [handed], false, false)),
        timeUp,
      ])
      if (!(answer instanceof Response))
        throw new TentError('T0009', `The route ${name} answered what is no response.`, {
          fix: 'Answer a `Response` from the `run` of the route.',
        })
      // The time ends when `run` has answered: a stream then lasts as long as its connection.
      logCall(o, { name, kind: 'route', caller, began })
      countAnswered(o, name, caller, began)
      return answer
    } catch (error) {
      refusedCall(o, name, caller, began, error)
      countAnswered(o, name, caller, began, error)
      return errorAnswer(o, name, error)
    } finally {
      cancel()
    }
  },
}
