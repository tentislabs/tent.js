import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'
import { drivenEnded, madeSession } from '../sessions.ts'
import { browserFound } from './browserFound.ts'
import { driven } from './driven.ts'
import { drawnAt, routesOf } from './routes.ts'
import { routedOver } from './chromium.ts'

/** What a picture of a screen is asked with. */
export interface ShotAsked {
  as?: string | Caller
  size?: { width: number; height: number }
  full?: boolean
  dark?: boolean
  out?: string
  // How long the page may take before the picture is taken all the same, in milliseconds.
  wait?: number
  // A still document that the address is answered with in place of the page, which runs no page code.
  document?: string
}

/** How long no request may be open before the page is taken as settled, in milliseconds. */
const quiet = 500

/**
 * Takes an app, the path of a screen, and how the picture is asked for. Drives a browser of the Chromium family to
 * the screen, as nobody or as a user, by the cookie of a session made for that user and set into the browser first,
 * which ends with the browser, and takes a picture of it once the page has come alive, its first results have arrived and no request was open
 * for half a second, or after ten seconds. Every request of
 * the browser that leaves for another place than the app is made by the engine, held to the rule of the guarded
 * fetch, so the browser never reaches into this computer's own network. Answers where the picture was written,
 * its size, and the status of the screen.
 */
export async function shotOf(
  o: Opened,
  path: string,
  asked: ShotAsked = {},
): Promise<{ file: string; width: number; height: number; status: number }> {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new TentError('T0002', 'A picture is taken of a path of the app.')
  if (asked.as !== undefined && asked.as !== 'nobody' && o.mode === 'live')
    throw new TentError('T0013', 'On live data a picture is taken as nobody.', {
      fix: 'A program that holds the app gets a signed-in page with `app.page(path, { as })`.',
    })
  const width = asked.size?.width ?? 1280
  const height = asked.size?.height ?? 800
  const at = drawnAt(o)
  const address = `${at.origin}${path}`
  const routes = await routesOf(o, at)
  const page = await driven(await browserFound())
  // The session of the user that the browser is, which ends with the picture.
  let cookie: string | undefined
  try {
    let open = 0
    let last = performance.now()
    let status = 0
    page.on('Network.requestWillBeSent', () => {
      open += 1
      last = performance.now()
    })
    const closed = (): void => {
      open = Math.max(0, open - 1)
      last = performance.now()
    }
    page.on('Network.loadingFinished', closed)
    page.on('Network.loadingFailed', closed)
    page.on('Network.responseReceived', (told) => {
      if (told.type === 'Document' && isStored(told.response)) status = Number(told.response.status)
    })
    // A request for the app itself goes on as it is; any other is made by the engine, under its rule.
    routedOver(page, routes, asked.document === undefined ? undefined : { address, document: asked.document })
    await page.send('Network.enable')
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: asked.dark ? 'dark' : 'light' }],
    })
    await page.send('Page.enable')
    if (asked.as !== undefined && asked.as !== 'nobody') {
      cookie = madeSession(o, asked.as, true)
      const split = cookie.indexOf('=')
      const [name, value] = [cookie.slice(0, split), cookie.slice(split + 1)]
      await page.send('Network.setCookie', { name, value, url: address, httpOnly: true, sameSite: 'Lax' })
    }
    await page.send('Page.navigate', { url: address })
    // The page has come alive, its first results arrived, and no request was open for a while; or the time is up.
    const until = performance.now() + (asked.wait ?? 10_000)
    for (;;) {
      await new Promise((done) => setTimeout(done, 100))
      if (performance.now() >= until) break
      const alive = await page
        .send('Runtime.evaluate', {
          // A still document holds no page code: it is settled once it and its fonts are loaded.
          expression:
            asked.document === undefined
              ? "document.querySelector('body > div#tent')?.hasAttribute('data-t-alive') === true"
              : "document.readyState === 'complete' && document.fonts.status === 'loaded'",
          returnByValue: true,
        })
        .catch((): Record<string, unknown> => ({}))
      const lives = isStored(alive.result) && alive.result.value === true
      if (lives && asked.document !== undefined) break
      if (lives && open === 0 && performance.now() - last >= quiet) break
    }
    let taken = { width, height }
    if (asked.full) {
      const metrics = await page.send('Page.getLayoutMetrics')
      const content = isStored(metrics.cssContentSize) ? metrics.cssContentSize : {}
      taken = { width, height: Math.max(height, Math.ceil(Number(content.height ?? height))) }
      await page.send('Emulation.setDeviceMetricsOverride', { ...taken, deviceScaleFactor: 1, mobile: false })
    }
    const picture = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: asked.full === true,
    })
    const file =
      asked.out ??
      join(
        o.dataFolder,
        'shots',
        `${path.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home'}-${Date.now()}.png`,
      )
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, Buffer.from(String(picture.data ?? ''), 'base64'))
    return { file, ...taken, status }
  } finally {
    await page.end()
    if (cookie !== undefined) await drivenEnded(o, cookie)
  }
}
