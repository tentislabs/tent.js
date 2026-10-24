import type { Address } from '../door/address.ts'

/**
 * `GET /robots.txt`: lets everything be read on live data and names the sitemap, and lets nothing be read in the
 * modes `development` and `test`, so that no copy of test data is ever found. It passes steps 1, 2 and 4 of the door.
 */
export const address: Address = {
  order: 4,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname === '/robots.txt' && {},
  steps: [1, 2, 4],
  async handle({ app, about }) {
    const rule = app.mode === 'live' ? 'Allow: /' : 'Disallow: /'
    const text = `User-agent: *\n${rule}\nSitemap: ${about.origin}/sitemap.xml\n`
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' },
    })
  },
}
