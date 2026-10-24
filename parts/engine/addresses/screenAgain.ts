import { TentError } from '../../core/index.ts'
import { isDoorPath } from '../../core/internal.ts'
import type { Address } from '../door/address.ts'
import { refusedCall } from '../door/failure.ts'
import type { Opened } from '../opened.ts'
import { screenRequestCounted } from '../pages/count.ts'
import { routeAt } from '../routes.ts'
import { versionGone } from '../versions.ts'
import { errorAnswer, okAnswer } from '../wire.ts'
import { screenCaller } from '../door/scopes.ts'
import { namedFor } from '../gradual/served.ts'

const name = '/_t/screen'

/** The error of a request for a screen again that names no address of the app. */
const noAddress = (path: unknown): TentError =>
  new TentError('T0001', `${(JSON.stringify(path) ?? 'Nothing').slice(0, 120)} is no address of the app.`, {
    fix: 'Name an address of the app in `path`: it starts with one slash, and names no other site.',
  })

/**
 * Whether a path is one that another address of the door takes: one that the door takes before any screen,
 * and a `route` that states GET. The page loads such an address as it is written.
 */
const isOurs = (app: Opened, path: string): boolean => isDoorPath(path) || routeAt(app, 'GET', path) !== undefined

/**
 * `GET /_t/screen?path=<an address of the app>&version=<the page's version>`: what a request for that address
 * would have answered, as data, in the wire form: the record of the page, with every answer that the draw met and
 * no drawing; `{ goTo }` where that request would have sent the visitor on to another address of the app; and
 * `{ leave }` for an address that another address of the door takes, and for a screen that needs a sign-in where
 * no screen stands at the sign-in path. It passes steps 1 to 4 of the door, counted
 * as a request for a screen, and step 10. A version that can no longer be loaded answers T0007 with the running
 * one. With `prefetch=1` no action of `data` is called. With `above=1` the screen is drawn to be opened above another.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname === name && { name },
  steps: [1, 2, 3],
  async handle({ app, request, about, caller: found, began }) {
    const caller = screenCaller(found)
    const asked = new URL(request.url).searchParams
    const path = asked.get('path')
    const version = asked.get('version')
    try {
      screenRequestCounted(app, about.from)
      // The address is taken as it is written: one that names another site, or no address at all, is not found.
      if (path === null || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw noAddress(path)
      // The page is served by the version it names while that can be loaded, and is told the running one otherwise.
      const served = namedFor(app, caller, version ?? undefined)
      if (!served) throw versionGone(version)
      const url = new URL(`http://localhost${path}`)
      if (url.host !== 'localhost') throw noAddress(path)
      if (isOurs(served, url.pathname)) return okAnswer({ leave: path })
      if (!Object.keys(served.description.screens).length)
        throw (await import('../pages/none.ts')).noScreens(url.pathname)
      const { pageAnswer } = await import('../pages/answer.ts')
      const answer = await pageAnswer(
        served,
        url,
        about.origin,
        caller,
        about.from,
        asked.get('prefetch') === '1',
        request.headers.get('cookie'),
        { above: asked.get('above') === '1' },
      )
      // Where no screen stands for the sign-in it needs, the page loads the address whole, as a browser asks it.
      if (answer.whole) return okAnswer({ leave: path })
      // What a request for the address would have sent the visitor on to is told, and the page goes there itself.
      const location = answer.headers.location
      if (location !== undefined) return okAnswer(location.startsWith('/') ? { goTo: location } : { leave: location })
      if (!answer.page) throw noAddress(path)
      return okAnswer(answer.page)
    } catch (error) {
      refusedCall(app, name, caller, began, error)
      return errorAnswer(app, name, error)
    }
  },
}
