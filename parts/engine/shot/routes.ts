import type { Opened } from '../opened.ts'
import { privateHostsOf } from '../fetch/address.ts'
import { enginePort } from '../engineFile.ts'
import { outsideNoter } from '../touched.ts'

/** A request of a browser that the engine drives, as the browser tells it. */
export interface ShotRouteAsked {
  url: string
  method: string
  headers: [string, string][]
  body?: string
}

// The headers of a request that belong to its connection, and not to what it asks.
const ofTheConnection = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length'])

/** Where a document of a driven page asks its number among the documents of the page. */
const documentPath = '/_t/document'

/** What becomes of a request of a driven browser: it goes on as it is, or the engine answers it. */
export type Routed = 'through' | Promise<Response>

/** Where a driven browser reaches an app, and whether that is a name of the app's own, which the program answers. */
export interface DrawnAt {
  origin: string
  own: boolean
}

/**
 * Takes an app. Answers where its driven browser reaches it: under the first name of its own that is no `*`, which
 * the app answers in this program so that the browser need not find the name, and else this computer at the port
 * that the engine wrote for the commands of this computer.
 */
export function drawnAt(o: Opened): DrawnAt {
  const own = o.named?.find((name) => name !== '*')
  return own === undefined
    ? { origin: `http://localhost:${enginePort(o.dataFolder)}`, own: false }
    : { origin: `http://${own}`, own: true }
}

/**
 * Takes an app, the origin that its driven browser reaches it by, and whether the app answers on names of its own.
 * Answers what becomes of each request of that browser: a request for the app goes on as it is, or where the app
 * has names of its own is answered by the app in this program, so that the browser need not find the name; any
 * other is made by the engine, held to the rule of the guarded fetch, so the browser never reaches into the
 * network of this computer: noted as reaching outside under the test that opened the page, and refused by its
 * connection where this program holds what reaches outside. A refusal of the guard refuses the promise.
 */
export async function routesOf(o: Opened, { origin, own }: DrawnAt): Promise<(asked: ShotRouteAsked) => Routed> {
  const { guardedFetch } = await import('../../connect/index.ts')
  const fetched = guardedFetch({ mode: o.mode, privateHosts: privateHostsOf(o.description) })
  // The browser asks where no test's work is under way: the test that opened the page is the one it asks for.
  const noteOutside = outsideNoter()
  // How many documents the page has loaded: each document asks its number as it begins, and draws the ids of its
  // calls by it, which nothing of the page can take back.
  let documents = 0
  return (asked) => {
    const ours = asked.url.startsWith(`${origin}/`) || asked.url === origin
    if (ours && new URL(asked.url).pathname === documentPath)
      return Promise.resolve(new Response(String(++documents), { headers: { 'cache-control': 'no-store' } }))
    if ((ours && !own) || asked.url.startsWith('data:')) return 'through'
    // A request goes on with its headers and its body, to another place as to the app.
    const init = {
      method: asked.method,
      headers: asked.headers,
      ...(asked.body !== undefined && asked.method !== 'GET' && asked.method !== 'HEAD' ? { body: asked.body } : {}),
    }
    if (ours) return Promise.resolve().then(() => o.app.request(new Request(asked.url, init)))
    // What names the connection itself is the fetch's own to write. A refusal of the guard refuses the promise,
    // and never throws where the browser's event is heard.
    const headers = asked.headers.filter(([name]) => !ofTheConnection.has(name.toLowerCase()))
    const host = URL.canParse(asked.url) ? new URL(asked.url).host : asked.url
    noteOutside(`page ${host}`)
    return Promise.resolve().then(() => fetched(asked.url, { ...init, headers, time: 10_000 }))
  }
}
