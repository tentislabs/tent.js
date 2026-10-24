import type { Address } from '../door/address.ts'
import { askedBefore } from '../onRequest.ts'
import { screenRequestCounted } from '../pages/count.ts'
import { errorAnswer } from '../wire.ts'
import { screenCaller } from '../door/scopes.ts'
import { releasedFor } from '../gradual/served.ts'
import { flowingBody, flowsHeader } from '../web/flowing.ts'

/**
 * A `GET` of an address that no other address of the door takes: a request for a screen. It passes steps 1 to 4
 * of the door, and the screen's own rule as steps 5 and 6. An app that holds no screen answers no such address.
 */
export const address: Address = {
  // The last of the addresses: every other one is tried first.
  order: 7,
  match(request) {
    const { pathname } = new URL(request.url)
    const ours = pathname.startsWith('/_t/') || pathname === '/_t' || pathname.startsWith('/api/')
    return request.method === 'GET' && !ours && { name: pathname }
  },
  // Step 4 counts a request for a screen for its address, on a count of its own.
  steps: [1, 2, 3],
  async handle({ app, request, about, caller: found }) {
    const caller = screenCaller(found)
    const url = new URL(request.url)
    try {
      if (!Object.keys(app.description.screens).length) throw (await import('../pages/none.ts')).noScreens(url.pathname)
      // What draws a screen is loaded with the first request for one.
      const { pageAnswer } = await import('../pages/answer.ts')
      screenRequestCounted(app, about.from)
      // While a release goes, a page is drawn by the version its caller is given, and keeps it.
      const page = await pageAnswer(
        releasedFor(app, caller),
        url,
        about.origin,
        caller,
        about.from,
        false,
        request.headers.get('cookie'),
        {
          asked: askedBefore(about),
          // A browser that takes HTML is sent the first piece of a page whose parts wait, and each part as it comes.
          stream: /text\/html/i.test(request.headers.get('accept') ?? ''),
          languages: request.headers.get('accept-language'),
        },
      )
      if (page.rest)
        return new Response(flowingBody(page.html, page.rest), {
          status: page.status,
          headers: { ...page.headers, [flowsHeader]: '1' },
        })
      return new Response(page.status === 302 || page.status === 308 ? null : page.html, {
        status: page.status,
        headers: page.headers,
      })
    } catch (error) {
      return errorAnswer(app, url.pathname, error)
    }
  },
}
