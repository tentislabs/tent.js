import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { isPath, isStored, readFields, typedOf, projectZone } from '../../core/internal.ts'
import type { Address } from '../door/address.ts'
import type { Opened } from '../opened.ts'
import { called } from '../door/call.ts'
import { refusedCall } from '../door/failure.ts'
import { limitOf } from '../limits.ts'
import { carriedTo, inspectName } from '../pages/inspect.ts'
import { screenNamedAt } from '../pages/named.ts'
import { zoneOf } from '../pages/zone.ts'
import { bodyOf } from '../web/body.ts'
import { errorAnswer, wireError } from '../wire.ts'
import { screenCaller } from '../door/scopes.ts'
import { namedFor } from '../gradual/served.ts'
import { nameAfter } from '../web/decoded.ts'
import { carriesEngineCookie } from '../cookies.ts'
import { sameOrigin } from '../door/web.ts'

const prefix = '/_t/form/'

/**
 * The `then` of a form that was sent with no script: the screen it was sent from is drawn as the caller, as it
 * stands before the call, and the form of that name tells where its `then` goes with what the call will answer, as
 * the page would. So a call that takes the form away still follows it. A draw that fails, a form the draw does not
 * meet, and a `then` that names no path of the app, go nowhere.
 */
async function thenOf(
  o: Opened,
  at: string,
  how: { form: string; caller: Caller; origin: string; from: string; cookies: string | null },
): Promise<(answer: unknown) => string | undefined> {
  const { pageAnswer } = await import('../pages/answer.ts')
  const nowhere = (): undefined => undefined
  try {
    const drawn = await pageAnswer(
      o,
      new URL(`http://localhost${at}`),
      how.origin,
      how.caller,
      how.from,
      false,
      how.cookies,
      { sending: how.form },
    )
    const follow = drawn.goesTo
    if (follow === undefined) return nowhere
    return (answer) => {
      try {
        const to = follow(answer)
        return to !== undefined && isPath(to) ? to : undefined
      } catch {
        return undefined
      }
    }
  } catch {
    return nowhere
  }
}

/** A refusal of a hidden address that is no address of a screen of the app. */
const noScreen = (at: string): TentError =>
  new TentError(
    'T0002',
    `The form names ${JSON.stringify(at).slice(0, 120)}, which is no address of a screen of the app.`,
    {
      fields: { 't-at': 'type' },
      fix: 'A form names the address of the screen it stands on, a path of the app.',
    },
  )

/**
 * `POST /_t/form/<name>`: a form that was sent with no script, in the plain form type. It passes all ten steps of
 * the door. A request that carries a cookie of the engine carries an `Origin`, which is the app's own. The hidden
 * `t-at` names the screen it was sent from. When the call worked, the answer is 303 to where the `then` of the
 * form goes, read from that screen as it is drawn before the call, or to `t-at`; when it failed, the screen at `t-at`
 * with the status 422 and the failed form.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const { pathname } = new URL(request.url)
    const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    return (
      request.method === 'POST' &&
      type === 'application/x-www-form-urlencoded' &&
      pathname.startsWith(prefix) && { name: nameAfter(pathname, prefix) }
    )
  },
  steps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  async handle({ app, request, about, caller: found, began }) {
    const caller = screenCaller(found)
    const name = nameAfter(new URL(request.url).pathname, prefix)
    const cookies = request.headers.get('cookie')
    let body: URLSearchParams
    let at: string
    try {
      // A page of another site that posts here sends the visitor's cookie with it: a form is taken from the app's
      // own Origin alone, whatever sites `api.origins` lists for the API, and one that carries a cookie of the app
      // from no other.
      const origin = request.headers.get('origin')
      if ((carriesEngineCookie(request) || origin !== null) && !(origin !== null && sameOrigin(origin, about.origin)))
        throw new TentError(
          'T0004',
          "A form comes from another Origin than the app's own: a listed site may call the API, and post no form.",
          {
            fix: 'Send the form from a page of the app.',
          },
        )
      body = new URLSearchParams(new TextDecoder().decode(await bodyOf(request, limitOf(app.description, 'callSize'))))
      at = body.get('t-at') ?? ''
      // The path of `t-at` is held to the rule of a path; after its question mark stand the states of its address.
      const atPath = at.split('?')[0]
      const control = [...at].some((one) => one.charCodeAt(0) < 32 || one.charCodeAt(0) === 127)
      const held = isPath(atPath) && !atPath.startsWith('//') && !control
      const found = held ? screenNamedAt(app.description, atPath) : undefined
      if (found === undefined) throw noScreen(at)
    } catch (error) {
      refusedCall(app, name, caller, began, error)
      return errorAnswer(app, name, error)
    }
    // A form of a version that is gone is read and run by the running one, and goes back to `t-at`: the `then` of
    // the running version may be another than the one of the page it was sent from.
    const named = body.get('t-version') || undefined
    const kept = namedFor(app, caller, named)
    const served = kept ?? app
    const made: unknown = served.description.functions[name]
    const input = isStored(made) && isStored(made.input) ? made.input : {}
    const zone = zoneOf(cookies) ?? projectZone(served.description.project)
    // A form that names none is the first over its function that has no id.
    const id = body.get('t-form') || name
    try {
      const follow =
        kept === undefined
          ? undefined
          : await thenOf(served, at, { form: id, caller, origin: about.origin, from: about.from, cookies })
      const answer = await called(served, name, readFields(input, body, zone), {
        caller,
        about: { from: about.from, origin: about.origin },
      })
      const to = follow?.(answer) ?? at
      // A page in the inspect mode keeps it: the page that the form leads to is in the mode too.
      const location = carriedTo(to, body.get(inspectName))
      return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } })
    } catch (error) {
      // The screen is drawn again, as an ordinary request for it, with the failed form in its record.
      const url = new URL(`http://localhost${carriedTo(at, body.get(inspectName))}`)
      const { pageAnswer } = await import('../pages/answer.ts')
      const form = {
        id,
        values: typedOf(input, body),
        error: wireError(error, served.mode !== 'live').error,
      }
      const drawn = await pageAnswer(served, url, about.origin, caller, about.from, false, cookies, {
        shaped: { form, status: 422 },
      })
      return new Response(drawn.html || null, {
        status: drawn.status === 200 ? 422 : drawn.status,
        headers: drawn.headers,
      })
    }
  },
}
