import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { after } from 'node:test'
import type { Page } from '../../../rig/browser.ts'

// The servers of the tool that the tests of a file started: each is closed when the file ends.
const servers: Server[] = []
after(async () => {
  for (const server of servers) await new Promise((done) => server.close(done))
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A tool of another origin than the app, on this computer: a page that shows an address of the app in a frame
 * that fills the window, keeps every message that the frame posts to it, and posts what a test hands it. Answers
 * its origin.
 */
export async function toolServer(): Promise<string> {
  const server = createServer((request, response) => {
    const asked = new URL(request.url ?? '/', 'http://127.0.0.1')
    const src = asked.searchParams.get('src') ?? ''
    const app = src ? new URL(src).origin : ''
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(
      [
        '<!doctype html><html><head><meta charset="utf-8"><title>Tool</title></head>',
        '<body style="margin:0;background:#fff">',
        `<iframe id="app" src="${src.replaceAll('"', '&quot;')}" style="position:absolute;left:0;top:0;width:800px;height:600px;border:0"></iframe>`,
        '<script>',
        'window.got = []',
        `const app = ${JSON.stringify(app)}`,
        'const frame = document.getElementById("app")',
        'addEventListener("message", (event) => { if (event.origin === app && event.source === frame.contentWindow) window.got.push(event.data) })',
        'window.send = (message) => frame.contentWindow.postMessage(message, app)',
        '</script></body></html>',
      ].join('\n'),
    )
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  return `http://127.0.0.1:${isRecord(address) ? String(address.port) : ''}`
}

/** The place of a tag in a file of the project, as the page tells it. */
export interface Place {
  file: string
  from: number
  to: number
}

/** An element as the page tells it to the tool. */
export interface ToldElement {
  view: string
  place: Place
  uses: Place[]
  tag: string
  rect: { x: number; y: number; width: number; height: number }
  elements?: ToldElement[]
}

/** A place that a message holds, held to its form. */
function placeOf(value: unknown): Place {
  assert.ok(isRecord(value), `a place: ${JSON.stringify(value)}`)
  const { file, from, to } = value
  assert.ok(typeof file === 'string' && typeof from === 'number' && typeof to === 'number', JSON.stringify(value))
  return { file, from, to }
}

/** An element that a message holds, held to the form the page tells one in. */
export function toldElementOf(value: unknown): ToldElement {
  assert.ok(isRecord(value), `an element: ${JSON.stringify(value)}`)
  const { view, place, uses, tag, rect } = value
  assert.ok(typeof view === 'string' && typeof tag === 'string' && Array.isArray(uses) && isRecord(rect))
  const side = (name: string): number => Number(rect[name])
  return {
    view,
    place: placeOf(place),
    uses: uses.map(placeOf),
    tag,
    rect: { x: side('x'), y: side('y'), width: side('width'), height: side('height') },
    ...(Array.isArray(value.elements) ? { elements: value.elements.map(toldElementOf) } : {}),
  }
}

/** Every message that the frame posted to the tool so far. */
export const messagesOf = (page: Page): Promise<Record<string, unknown>[]> =>
  page.evaluate(() => Reflect.get(window, 'got'))

/** Posts a message of the tool to the frame. */
export const postToFrame = (page: Page, message: object): Promise<void> =>
  page.evaluate((one) => Reflect.apply(Reflect.get(window, 'send'), window, [one]), message)

/** Waits until the frame has posted a message that holds, and answers it. It waits for what it reads, and for no length of time. */
export async function waitFor(
  page: Page,
  what: string,
  holds: (one: Record<string, unknown>) => boolean,
  from = 0,
): Promise<Record<string, unknown>> {
  for (let n = 0; n < 1500; n++) {
    const found = (await messagesOf(page)).slice(from).find(holds)
    if (found) return found
    await new Promise((done) => setTimeout(done, 10))
  }
  return assert.fail(`never: ${what}; the frame posted ${JSON.stringify((await messagesOf(page)).slice(from))}`)
}

/** Opens the tool with an address of the app in its frame, and waits for the page to say it is ready. */
export async function toolOpened(page: Page, tool: string, address: string, screen: string): Promise<void> {
  await page.goto(`${tool}/?src=${encodeURIComponent(address)}`)
  await waitFor(page, `${screen} is ready`, (one) => one.t === 'tent.ready' && one.screen === screen)
}

/** The frame of the app inside the tool. */
export function frameOf(page: Page) {
  const found = page.frames().find((one) => one !== page.mainFrame())
  if (!found) return assert.fail('the tool holds no frame')
  return found
}
