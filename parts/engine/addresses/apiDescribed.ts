import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { problemAnswer } from '../api/problem.ts'
import type { CallContext, Work } from '../context.ts'
import type { Address } from '../door/address.ts'
import { allows } from '../door/carry.ts'
import { logCall, refusedCall } from '../door/failure.ts'
import { refusedBy, ruled } from '../door/rule.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { projectCode } from '../ownCode.ts'
import { visit } from '../visit.ts'
import { bytesAt } from '../files.ts'
import { routeAt } from '../routes.ts'

// The two files of the description of the API, by the address each is served at and the kind it is sent as.
const files: Record<string, { field: 'openapi' | 'docs'; kind: string }> = {
  '/api/openapi.json': { field: 'openapi', kind: 'application/json; charset=utf-8' },
  '/api/docs': { field: 'docs', kind: 'text/html; charset=utf-8' },
}

/**
 * `describeTo` of the project: who may read what the app offers to programs. Signed-in callers when it is left
 * out, a key among them. Throws T0006 for nobody, and T3101 for another caller it keeps out.
 */
export function mayDescribe(o: Opened, caller: Caller): void {
  const access: Record<string, unknown> = Object(o.description.project.describeTo ?? { rule: 'signedIn' })
  const said = ruled(access, caller)
  if ('needs' in said) throw refusedBy('The description of the app', said.needs, caller)
  if (said.says !== 'asks') return
  const work: Work = {
    name: 'describeTo',
    kind: 'rule',
    depth: 1,
    now: new Date(o.clock.now()),
    ends: performance.now() + limitOf(o.description, 'queryTime'),
  }
  const cx: CallContext = { app: o, version: o.version, caller, made: 0, signal: new AbortController().signal, work }
  const arrow = projectCode(o, 'describeTo')
  if (!allows(o, cx, { access, input: {}, ...(arrow ? { arrow } : {}) }))
    throw refusedBy('The description of the app', 'needs a caller that `describeTo` lets in', caller)
}

/**
 * `GET /api/openapi.json` and `GET /api/docs`: the two files that the build wrote of the API, as they are. They
 * pass steps 1 to 4 and 10 of the door, and then `describeTo`. The docs page is sent with a policy that lets no
 * script run. An app that offers nothing to the API has neither.
 */
export const address: Address = {
  order: 2,
  match: (request) => {
    const { pathname } = new URL(request.url)
    const o = visit()?.app
    // A route under `/api/` is tried before the API.
    return (
      request.method === 'GET' &&
      Object.hasOwn(files, pathname) &&
      o?.description.api !== undefined &&
      !routeAt(o, request.method, pathname) && { name: pathname }
    )
  },
  steps: [1, 2, 3, 4, 10],
  refused: problemAnswer,
  async handle({ app: o, request, caller, began }) {
    const { pathname } = new URL(request.url)
    const { field, kind } = files[pathname]
    try {
      mayDescribe(o, caller)
      const file: unknown = Reflect.get(Object(o.description.api), field)
      if (typeof file !== 'string') throw new TentError('T0001', 'The bundle names no description of the API.')
      const bytes = bytesAt(o.bundle, file)
      logCall(o, { name: pathname, caller, began })
      return new Response(bytes, {
        status: 200,
        headers: {
          'content-type': kind,
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
          ...(field === 'docs' ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}),
        },
      })
    } catch (error) {
      refusedCall(o, pathname, caller, began, error)
      return problemAnswer(o, pathname, error)
    }
  },
}
