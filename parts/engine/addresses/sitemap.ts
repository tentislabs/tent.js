import { sitemapFile } from '../../core/internal.ts'
import type { Address } from '../door/address.ts'
import { siteAddresses, sitemapText } from '../pages/sitemap.ts'

/**
 * `GET /sitemap.xml` and `/sitemap-<number>.xml`: the addresses of the public screens, written with the origin that
 * the app was reached by. They pass steps 1, 2 and 4 of the door. An app that holds no screen answers no such address.
 */
export const address: Address = {
  order: 4,
  match(request) {
    if (request.method !== 'GET') return false
    const file = sitemapFile(new URL(request.url).pathname)
    return file !== undefined && { file }
  },
  steps: [1, 2, 4],
  async handle({ app, matched, about, caller }) {
    const file = Number(Object(matched).file)
    const text = Object.keys(app.description.screens).length
      ? sitemapText(await siteAddresses(app, about.origin, caller), about.origin, file)
      : undefined
    if (text === undefined) return new Response('', { status: 404, headers: { 'x-content-type-options': 'nosniff' } })
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'application/xml; charset=utf-8', 'x-content-type-options': 'nosniff' },
    })
  },
}
