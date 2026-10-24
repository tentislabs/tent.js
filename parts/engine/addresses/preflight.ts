import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { framePreflight, listedSite, preflightLines, sharedPath } from '../door/sites.ts'
import { errorAnswer } from '../wire.ts'

/**
 * `OPTIONS` of an address that a page of a site that `api.origins` lists may call: the browser's question before
 * the call. It passes steps 1 and 2 of the door, and is answered with that site named, the methods, the headers and
 * how long the answer may be kept. The question of a frame of a chat app that is to send its pass is answered for
 * any site, with no cookie. The question of any other site is answered 403, naming no site.
 */
export const address: Address = {
  order: 1,
  // A question that carries no `Origin` is no browser's, and is answered as any other method is.
  match: (request) =>
    request.method === 'OPTIONS' &&
    request.headers.has('origin') &&
    sharedPath(new URL(request.url).pathname) && { name: 'options' },
  steps: [1, 2],
  async handle({ app, request, about }) {
    const site = listedSite(app, request.headers.get('origin'), about)
    if (site)
      return new Response(null, { status: 204, headers: preflightLines(app, site, new URL(request.url).pathname) })
    const framed = framePreflight(request)
    if (framed) return new Response(null, { status: 204, headers: framed })
    return errorAnswer(
      app,
      'options',
      new TentError('T0004', 'The question came from a site that `api.origins` does not list.', {
        fix: 'List the site in `api.origins` of the project.',
      }),
    )
  },
}
