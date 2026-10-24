import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'
import type { Browsed, BrowserOpening } from './browsed.ts'
import { browserFound } from './browserFound.ts'
import type { Driven } from './driven.ts'
import { driven } from './driven.ts'
import type { ShotRouteAsked, Routed } from './routes.ts'
import { routesOf } from './routes.ts'

/** The value or the words of one argument of a line of the console, as the channel tells it. */
const said = (argument: unknown): string => {
  const one = isStored(argument) ? argument : {}
  return 'value' in one ? String(one.value) : String(one.description ?? one.type ?? '')
}

/**
 * Takes a page that the engine drives over the channel of Chromium, the routes of its requests, and a still document
 * that one address is answered with in place of the page. Has every request of the page that the browser pauses go
 * through the routes: on as it is, answered by the engine, or refused where the engine refuses it.
 */
export function routedOver(
  page: Driven,
  routes: (asked: ShotRouteAsked) => Routed,
  still?: { address: string; document: string },
): void {
  page.on('Fetch.requestPaused', (told) => {
    const request = isStored(told.request) ? told.request : {}
    const url = String(request.url ?? '')
    if (still !== undefined && url === still.address)
      return void page
        .send('Fetch.fulfillRequest', {
          requestId: told.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'text/html; charset=utf-8' }],
          body: Buffer.from(still.document).toString('base64'),
        })
        .catch(() => undefined)
    const routed = routes({
      url,
      method: String(request.method ?? 'GET'),
      headers: Object.entries(Object(request.headers)).map(([name, value]): [string, string] => [name, String(value)]),
      ...(typeof request.postData === 'string' ? { body: request.postData } : {}),
    })
    if (routed === 'through')
      return void page.send('Fetch.continueRequest', { requestId: told.requestId }).catch(() => undefined)
    void routed
      .then(async (answer) => {
        await page.send('Fetch.fulfillRequest', {
          requestId: told.requestId,
          responseCode: answer.status,
          responseHeaders: [...answer.headers].map(([name, value]) => ({ name, value })),
          body: Buffer.from(await answer.arrayBuffer()).toString('base64'),
        })
      })
      .catch(() =>
        page
          .send('Fetch.failRequest', { requestId: told.requestId, errorReason: 'AccessDenied' })
          .catch(() => undefined),
      )
  })
}

/**
 * Takes an app, where its browser reaches it, and how the page is opened. Starts a browser of the Chromium family
 * and drives one page of it over the browser's own channel, with the small client that `tent shot` uses. Every
 * request of the page goes through the routes of the engine. Answers the page.
 */
export async function chromiumPage(
  o: Opened,
  at: { origin: string; own: boolean },
  opening: BrowserOpening,
): Promise<Browsed> {
  // A test drives the hidden browser of the pinned build alone, so that what it sees is the same on every computer.
  const page = await driven(await browserFound({ test: o.mode === 'test' }))
  try {
    const routes = await routesOf(o, at)
    const lines: string[] = []
    let loads: (() => void)[] = []
    routedOver(page, routes)
    page.on('Runtime.consoleAPICalled', (told) => {
      const args = Array.isArray(told.args) ? told.args : []
      lines.push(`${String(told.type)}: ${args.map(said).join(' ')}`)
    })
    page.on('Runtime.exceptionThrown', (told) => {
      const details = isStored(told.exceptionDetails) ? told.exceptionDetails : {}
      lines.push(`thrown: ${said(details.exception ?? { value: details.text })}`)
    })
    page.on('Page.loadEventFired', () => {
      const waiting = loads
      loads = []
      for (const one of waiting) one()
    })
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
    await page.send('Runtime.enable')
    await page.send('Page.enable')
    // The script that each document runs first, which a program may put another one in the place of.
    let first: unknown
    const preload = async (text: string): Promise<void> => {
      if (first !== undefined) await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: first })
      first = (await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${text})()` })).identifier
    }
    if (opening.preload) await preload(opening.preload)
    await page.send('Emulation.setDeviceMetricsOverride', { ...opening.size, deviceScaleFactor: 1, mobile: false })
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: opening.dark ? 'dark' : 'light' }],
    })
    await page.send('Network.enable')
    // The page tells the app that a test drives it, which the mode `test` alone reads.
    await page.send('Network.setCookie', { name: 'tent_test', value: '1', url: at.origin })
    if (opening.cookie)
      await page.send('Network.setCookie', { ...opening.cookie, url: at.origin, httpOnly: true, sameSite: 'Lax' })
    if (opening.language) {
      await page.send('Network.setExtraHTTPHeaders', { headers: { 'accept-language': opening.language } })
      await page.send('Emulation.setLocaleOverride', { locale: opening.language }).catch(() => undefined)
    }
    const evaluated = async (expression: string, byValue: boolean): Promise<Record<string, unknown>> => {
      const answer = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: byValue })
      if (isStored(answer.exceptionDetails)) {
        const details = answer.exceptionDetails
        throw new Error(said(details.exception ?? { value: details.text }))
      }
      return isStored(answer.result) ? answer.result : {}
    }
    const mouse = (type: string, at: { x: number; y: number }): Promise<unknown> =>
      page.send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 })
    return {
      engine: 'chromium',
      origin: at.origin,
      go: async (address) => {
        await page.send('Page.navigate', { url: address })
      },
      async evaluate(expression) {
        const result = await evaluated(`(async () => JSON.stringify(await (${expression})))()`, true)
        return typeof result.value === 'string' ? JSON.parse(result.value) : undefined
      },
      async click(at) {
        await mouse('mouseMoved', at)
        await mouse('mousePressed', at)
        await mouse('mouseReleased', at)
      },
      type: async (text) => {
        await page.send('Input.insertText', { text })
      },
      async enter() {
        const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, text: '\r' })
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
      },
      async files(expression, paths) {
        const element = await evaluated(expression, false)
        if (typeof element.objectId !== 'string') throw new TentError('T0001', 'No field of files was found.')
        await page.send('DOM.setFileInputFiles', { files: paths, objectId: element.objectId })
      },
      async picture(how = {}) {
        if (how.full) {
          const metrics = await page.send('Page.getLayoutMetrics')
          const content = isStored(metrics.cssContentSize) ? metrics.cssContentSize : {}
          const height = Math.max(opening.size.height, Math.ceil(Number(content.height ?? opening.size.height)))
          await page.send('Emulation.setDeviceMetricsOverride', {
            width: opening.size.width,
            height,
            deviceScaleFactor: 1,
            mobile: false,
          })
        }
        try {
          const taken = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: how.full })
          return new Uint8Array(Buffer.from(String(taken.data ?? ''), 'base64'))
        } finally {
          if (how.full)
            await page.send('Emulation.setDeviceMetricsOverride', {
              ...opening.size,
              deviceScaleFactor: 1,
              mobile: false,
            })
        }
      },
      console: () => [...lines],
      preload,
      loaded: () =>
        new Promise((done) => {
          loads.push(done)
        }),
      end: () => page.end(),
    }
  } catch (error) {
    await page.end()
    throw error
  }
}
