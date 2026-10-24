import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { after } from 'node:test'

// The sites that the tests of a file started: each is closed when the file ends.
const started: Server[] = []
after(async () => {
  for (const server of started) await new Promise((done) => server.close(done))
})

/** What a site of this computer serves: the page that each path names, with the words of its address. */
type Pages = Record<string, (asked: URL) => string>

const page = (script: string, body = ''): string =>
  [
    '<!doctype html><html><head><meta charset="utf-8"><title>Site</title></head>',
    `<body style="margin:0;background:#fff">${body}<script>`,
    // Every message that reaches the page is kept with the origin it came from, whoever sent it.
    'window.got = []',
    'addEventListener("message", (event) => { window.got.push({ origin: event.origin, data: event.data }) })',
    script,
    '</script></body></html>',
  ].join('\n')

const quoted = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

/**
 * The pages a site of a tool, or of an attacker, serves. `/frame?src=` shows an address in a frame, and a second
 * frame of the address `evil=` where it is given; `/open?src=` opens it in a window of its own; `/listen` answers
 * the first window that posts to it with `tent.tree`; `/poster` posts what its parent hands it to the first frame
 * of its parent; `/seen` is a page that is only looked at.
 */
const pages: Pages = {
  '/frame': (asked) =>
    page(
      [
        'const frame = document.getElementById("app")',
        'window.loaded = false',
        'frame.addEventListener("load", () => { window.loaded = true })',
        'window.send = (message) => frame.contentWindow.postMessage(message, "*")',
        'window.goEvil = (message) => document.getElementById("evil").contentWindow.postMessage(message, "*")',
      ].join('\n'),
      [
        `<iframe id="app" src="${quoted(asked.searchParams.get('src') ?? '')}" style="position:absolute;left:0;top:0;width:800px;height:600px;border:0"></iframe>`,
        asked.searchParams.get('evil')
          ? `<iframe id="evil" src="${quoted(asked.searchParams.get('evil') ?? '')}/poster" style="position:absolute;left:0;top:0;width:1px;height:1px;border:0"></iframe>`
          : '',
      ].join(''),
    ),
  '/open': (asked) =>
    page(
      `window.openApp = () => { window.opened = window.open(${JSON.stringify(asked.searchParams.get('src') ?? '')}, "app") }`,
    ),
  '/listen': () =>
    page(
      [
        'window.answered = false',
        'addEventListener("message", (event) => {',
        '  if (window.answered || !event.source) return',
        '  window.answered = true',
        '  event.source.postMessage({ t: "tent.tree" }, "*")',
        '})',
      ].join('\n'),
    ),
  '/poster': () =>
    page(
      [
        'addEventListener("message", (event) => {',
        '  if (event.source !== parent) return',
        '  parent.frames[0].postMessage(event.data, "*")',
        '  parent.postMessage({ t: "evil.posted" }, "*")',
        '})',
      ].join('\n'),
    ),
  '/seen': () => page(''),
}

/** A site of this computer on a port of its own, with every request it was sent: its path and its `Referer`. */
export interface InspectedSite {
  origin: string
  asked: { path: string; referer: string }[]
}

/** Starts a site of this computer that serves the pages of a tool and of an attacker. Answers its origin. */
export async function siteStarted(): Promise<InspectedSite> {
  const asked: InspectedSite['asked'] = []
  const server = createServer((request, response) => {
    const at = new URL(request.url ?? '/', 'http://site.test')
    asked.push({ path: `${at.pathname}${at.search}`, referer: request.headers.referer ?? '' })
    const known = Object.hasOwn(pages, at.pathname)
    response.writeHead(known ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
    response.end(known ? pages[at.pathname](at) : '')
  })
  started.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  return { origin: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`, asked }
}
