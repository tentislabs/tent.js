import type { Address } from '../door/address.ts'
import { clientDocument, discovering } from '../mcp/outside/discover.ts'

const pattern = /^\/_t\/connect\/([A-Za-z][A-Za-z0-9]*)\/client$/

/**
 * `GET /_t/connect/<service>/client`: the document by which the app names itself to an outside server whose
 * sign-in it discovers: the project's title and the one return address, under the name the app was reached by,
 * which is the client's name. It holds no secret and is open to everyone. It passes steps 1, 2 and 4.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const found = pattern.exec(new URL(request.url).pathname)
    return request.method === 'GET' && found !== null && { service: found[1], name: '/_t/connect/client' }
  },
  steps: [1, 2, 4],
  async handle({ app, matched, about }) {
    const service = String(Reflect.get(matched, 'service'))
    if (!discovering(app).includes(service)) return new Response(null, { status: 404 })
    const id = clientDocument(about.origin, service)
    const document = {
      client_id: id,
      client_name: String(app.description.project.title ?? app.name),
      client_uri: about.origin,
      redirect_uris: [`${about.origin}/_t/connect/${service}`],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
    return new Response(JSON.stringify(document), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
    })
  },
}
