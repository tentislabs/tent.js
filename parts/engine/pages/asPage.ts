import type { Opened } from '../opened.ts'
import { languageOf } from '../grants/words.ts'
import type { OwnKind } from './own.ts'
import { ownHeaders, ownPage } from './own.ts'

/** The page of the engine that a code of a refusal is shown with. */
function kindOf(code: string, status: number): OwnKind {
  if (code === 'T0007') return 'outOfDate'
  if (code === 'T0005' || status === 429) return 'tooMany'
  if (code === 'T0006' || status === 401) return 'signIn'
  if (status === 404) return 'notFound'
  return 'error'
}

/** Whether the answer of a request may be shown as a page of the engine: a `GET` of a browser, on live data. */
export const mayBePage = (o: Opened, request: Request): boolean =>
  o.mode === 'live' && request.method === 'GET' && /text\/html/i.test(request.headers.get('accept') ?? '')

/**
 * Takes an app, a request and its answer. Where a browser asked for a page with `GET` and is answered a refusal of
 * the wire, it is answered the same words as a page of the engine, with the same status, on live data: so a person
 * who opens an address is shown a page and no JSON, and the words of the page alone. Any other answer, and every
 * answer in development and in the mode `test`, where the refusal is told in full, is answered as it is.
 */
export async function asPage(o: Opened, request: Request, answer: Response): Promise<Response> {
  if (!mayBePage(o, request) || answer.status < 400) return answer
  if (!/application\/json/i.test(answer.headers.get('content-type') ?? '')) return answer
  const wire: unknown = await answer
    .clone()
    .json()
    .catch(() => undefined)
  const error: unknown = Reflect.get(Object(wire), 'error')
  const code = String(Reflect.get(Object(error), 'code') ?? '')
  if (Reflect.get(Object(wire), 'ok') !== false || code === '') return answer
  const html = ownPage({
    description: o.description,
    language: languageOf(o.description, request.headers.get('accept-language')),
    status: answer.status,
    kind: kindOf(code, answer.status),
  })
  const headers = new Headers(ownHeaders())
  // What the answer said beside its body still holds: a cookie it set, and how long a count holds the sender back.
  for (const cookie of answer.headers.getSetCookie()) headers.append('set-cookie', cookie)
  const retry = answer.headers.get('retry-after')
  if (retry) headers.set('retry-after', retry)
  return new Response(html, { status: answer.status, headers })
}
