import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { isPath, isStored } from '../../core/internal.ts'
import type { Address } from '../door/address.ts'
import { refusedCall } from '../door/failure.ts'
import { checkedInput } from '../door/input.ts'
import { ruled } from '../door/rule.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { screenRequestCounted } from '../pages/count.ts'
import { screenNamedAt } from '../pages/named.ts'
import { versionGone } from '../versions.ts'
import { bodyOf } from '../web/body.ts'
import type { About } from '../web/proxy.ts'
import { errorAnswer, okAnswer } from '../wire.ts'
import { namedFor } from '../gradual/served.ts'
import { screenCaller } from '../door/scopes.ts'
import { nameAfter } from '../web/decoded.ts'

const prefix = '/_t/part/'

/** A part that is not found: one of a screen that the caller may not see, and one that the screen does not use. */
const notFound = (name: string): TentError =>
  new TentError('T0001', `No screen at that address draws the part ${JSON.stringify(name).slice(0, 80)}.`, {
    fix: 'Ask for a part that the screen at `path` uses, for a caller who may see that screen.',
  })

/** Every component that a screen draws, however deep, and the layouts it is shown in. */
function usesOf(description: Parameters<typeof screenNamedAt>[0], screen: string): Set<string> {
  const found = new Set<string>()
  const waiting: unknown[] = [Object(description.screens[screen]).uses, Object(description.screens[screen]).layout]
  while (waiting.length) {
    const one = waiting.pop()
    for (const name of Array.isArray(one) ? one : [one]) {
      if (typeof name !== 'string' || found.has(name)) continue
      found.add(name)
      const component: unknown = description.components[name]
      if (isStored(component)) waiting.push(component.uses, component.layout)
    }
  }
  return found
}

/**
 * `GET /_t/part/<component>?props=<JSON>`, in the mode `test` alone: the component drawn alone as a page, with the
 * props it is handed, open to the caller of the test, for `app.open(Component, { props })`. The props are held to the
 * declared types of the component (T0002). In every other mode, and for a name that is no component, it is not found.
 */
async function drawnAlone(
  app: Opened,
  request: Request,
  about: About,
  caller: Caller,
  began: number,
): Promise<Response> {
  const url = new URL(request.url)
  const name = nameAfter(url.pathname, prefix)
  try {
    const component: unknown = Object.hasOwn(app.description.components, name)
      ? app.description.components[name]
      : undefined
    if (app.mode !== 'test' || !isStored(component))
      throw new TentError('T0001', `Nothing answers GET ${prefix}${JSON.stringify(name).slice(0, 80)}.`, {
        fix: 'A component is drawn alone in the mode `test`, for `app.open(Component, { props })`.',
      })
    let given: unknown
    try {
      given = JSON.parse(url.searchParams.get('props') ?? '{}')
    } catch {
      throw new TentError('T0002', 'The props of a component drawn alone are one record of JSON.', {
        fields: { props: 'type' },
      })
    }
    const props = checkedInput(name, component.props, isStored(given) ? given : {}, {
      now: new Date(app.clock.now()),
      zone: 'UTC',
      caller,
    })
    const { pageAnswer } = await import('../pages/answer.ts')
    const drawn = await pageAnswer(app, url, about.origin, caller, about.from, false, request.headers.get('cookie'), {
      alone: { component: name, props },
    })
    return new Response(drawn.html, { status: drawn.status, headers: drawn.headers })
  } catch (error) {
    refusedCall(app, prefix, caller, began, error)
    return errorAnswer(app, prefix, error)
  }
}

/**
 * `POST /_t/part/<component>`, with `{ props, path, version }`: one use of a component that is drawn on the server
 * alone, drawn again for a living page, as the caller, for whom a key is nobody as for a screen. The request is held to the screen at `path`: its rule for
 * the caller, and that it uses the component. `props` are held to the declared types of the component (T0002), and
 * a version that is gone is T0007. Answers `{ html, answers, mark }`, and counts as a request for a screen.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith(prefix)) return false
    if (request.method === 'GET') return { name: pathname, alone: true }
    return request.method === 'POST' && { name: pathname }
  },
  steps: [1, 2, 3],
  async handle({ app, request, about, caller: found, began, matched }) {
    // A part is drawn as its screen is, for which a key is nobody.
    const caller = screenCaller(found)
    if (Reflect.get(matched, 'alone') === true) return drawnAlone(app, request, about, caller, began)
    const name = nameAfter(new URL(request.url).pathname, prefix)
    try {
      screenRequestCounted(app, about.from)
      const body: unknown = JSON.parse(
        new TextDecoder().decode(await bodyOf(request, limitOf(app.description, 'callSize'))),
      )
      const told = isStored(body) ? body : {}
      const served = namedFor(app, caller, told.version ?? undefined)
      if (!served) throw versionGone(told.version)
      const path = typeof told.path === 'string' && isPath(told.path.split('?')[0]) ? told.path : undefined
      if (path === undefined || path.startsWith('//')) throw notFound(name)
      const description = served.description
      const component: unknown = description.components[name]
      const screen = screenNamedAt(description, path.split('?')[0])
      if (!isStored(component) || component.browser !== false || !screen || !usesOf(description, screen).has(name))
        throw notFound(name)
      // A caller whom the rule of the screen does not let in is told nothing of its parts, whatever they are given.
      if ('needs' in ruled(Object(description.screens[screen]).access, caller)) throw notFound(name)
      const props = checkedInput(name, component.props, told.props ?? {}, {
        now: new Date(served.clock.now()),
        zone: 'UTC',
        caller,
      })
      const { pageAnswer } = await import('../pages/answer.ts')
      const url = new URL(`http://localhost${path}`)
      const drawn = await pageAnswer(
        served,
        url,
        about.origin,
        caller,
        about.from,
        false,
        request.headers.get('cookie'),
        {
          part: { component: name, props },
        },
      )
      // A caller who may not see the screen is told nothing of its part.
      if (!drawn.part) throw notFound(name)
      return okAnswer(drawn.part)
    } catch (error) {
      refusedCall(app, prefix, caller, began, error)
      return errorAnswer(app, prefix, error instanceof SyntaxError ? notFound(name) : error)
    }
  },
}
