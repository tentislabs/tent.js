// The one file that names the driver of a real browser. A test of a part imports it, and no file that is shipped.
import { after } from 'node:test'
import type { Browser, Page } from 'playwright-core'
import { chromium, firefox, webkit } from 'playwright-core'
import { silenced } from './silence.ts'
import { secondFamily, testFamily, testFontRules } from './testFont.ts'

export type { Page } from 'playwright-core'

/** A browser engine that a test is run in. */
export type BrowserEngine = 'chromium' | 'firefox' | 'webkit'

/** The three engines, in the order a test goes through them. */
export const browserEngines: readonly BrowserEngine[] = ['chromium', 'firefox', 'webkit']

const launchers = { chromium, firefox, webkit }

// The browser of each engine of this program, started at its first use and kept until the program's tests end: each
// call takes a context of its own in it, a few megabytes and milliseconds where a browser takes a hundred and a
// second, as Playwright's own runner keeps one browser for each of its programs. Firefox lets a page reach a made-up
// device by preferences of the whole browser, so it keeps a second browser for the calls that ask for one.
const kept = new Map<string, Promise<Browser>>()
const started: Record<BrowserEngine, number> = { chromium: 0, firefox: 0, webkit: 0 }

/** How many browsers of each engine this program started. */
export const browsersStarted = (): Record<BrowserEngine, number> => ({ ...started })

/**
 * The browser of an engine for this program, started where there is none or where it was lost. No browser plays
 * sound out of the speakers of the computer the tests run on: Chromium by its flag, Firefox by its preference, and
 * WebKit, which has neither, by what its pages run first. Every Chromium lets a page reach a made-up device: that is
 * a flag of the browser, and a page that asks for none is held by its context, which grants nothing.
 */
async function browserOf(engine: BrowserEngine, device: boolean): Promise<Browser> {
  const key = engine === 'firefox' && device ? 'firefox with a device' : engine
  const held = await kept.get(key)?.catch(() => undefined)
  if (held?.isConnected()) return held
  started[engine] += 1
  const made = launchers[engine].launch({
    headless: true,
    ...(engine === 'chromium'
      ? { args: ['--mute-audio', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }
      : {}),
    ...(engine === 'firefox'
      ? {
          firefoxUserPrefs: {
            'media.volume_scale': '0.0',
            ...(device ? { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true } : {}),
          },
        }
      : {}),
  })
  kept.set(key, made)
  return made
}

// The browsers end when the tests of the program have: none is left behind it, and none holds it open.
after(async () => {
  for (const one of kept.values()) await (await one.catch(() => undefined))?.close()
  kept.clear()
})

/** Whether an address is one of this computer, or one that reaches no network at all. */
function isHere(address: string): boolean {
  const { protocol, hostname } = new URL(address)
  return ['about:', 'data:', 'blob:'].includes(protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

/**
 * Starts a browser of one engine, with no window, and hands `work` a fresh page of it: of the size that `width`
 * and `height` give, 800 by 600 where they give none, and with scripts switched off where `scripts` is false. The
 * page reaches this computer alone: a request for any other address is cut off. With `device` the browser lets a
 * page use the place, the camera and the microphone of the device with no question, each a made-up one where the
 * engine has such: so a test sees what the page's own policy closes, and not what a person was never asked. No
 * engine plays sound, and what a page reads of a playing element and of a voice stays as the page set it. The page
 * is of a context of its own in the browser of the program, which is closed when the work is done, also where it
 * fails: the browser stays for the next call. Answers what the work answered.
 */
export async function inBrowser<Answer>(
  engine: BrowserEngine,
  work: (page: Page) => Promise<Answer>,
  o: { width?: number; height?: number; scripts?: boolean; device?: boolean } = {},
): Promise<Answer> {
  const browser = await browserOf(engine, o.device === true)
  const context = await browser.newContext({
    // One zone on every computer, nine hours ahead of UTC all year and the zone of no project of the tests, so a
    // page's own zone is never the zone of the project by chance, as UTC is on a machine of the automatic runs.
    timezoneId: 'Asia/Tokyo',
    viewport: { width: o.width ?? 800, height: o.height ?? 600 },
    deviceScaleFactor: 1,
    javaScriptEnabled: o.scripts !== false,
    ...(o.device ? { permissions: ['geolocation'], geolocation: { latitude: 38.42, longitude: 27.14 } } : {}),
  })
  try {
    if (engine === 'webkit') await context.addInitScript(silenced)
    await context.route(
      (url) => !isHere(url.href),
      (route) => route.abort(),
    )
    return await work(await context.newPage())
  } finally {
    // A context whose browser was lost is closed already.
    await context.close().catch(() => undefined)
  }
}

/**
 * Starts a browser of one engine once, and hands `work` what takes a picture in it: of a whole document of HTML,
 * drawn with no network in a window of the size given, as the bytes of a PNG file. Every text of the document is
 * drawn with the test font: the page is given its faces, and its family as the font of the document. A picture is
 * taken only once every face has loaded and the page says of each of its texts that the test font draws it, and
 * the taking fails otherwise: so no picture is drawn with a font of this computer. With `focus`, the first element
 * that the selector finds is given the focus before the picture is taken, as the keyboard gives it, and where it
 * finds none nothing is. Each step of a taking has two minutes, so that a computer under load takes its pictures
 * too. The context is closed when the work is done, also where it fails. Answers what the work answered.
 */
export function picturesIn<Answer>(
  engine: BrowserEngine,
  work: (
    take: (html: string, size: { width: number; height: number }, focus?: string) => Promise<Uint8Array>,
  ) => Promise<Answer>,
): Promise<Answer> {
  return inBrowser(engine, (page) => {
    // The driver gives a step thirty seconds, which a browser under the load of other programs does not always keep.
    page.setDefaultTimeout(120000)
    page.setDefaultNavigationTimeout(120000)
    return work(async (html, size, focus) => {
      await page.setViewportSize(size)
      await page.setContent(html, { waitUntil: 'load' })
      await page.addStyleTag({ content: `${testFontRules()}\nhtml{font-family:'${testFamily}'}` })
      // Every face is loaded before the picture is taken, and the page says which family draws each of its texts.
      const said = await page.evaluate(
        async (families) => {
          await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
          await document.fonts.ready
          const unloaded = [...document.fonts].filter((face) => face.status !== 'loaded').length
          const first = (element: Element): string =>
            getComputedStyle(element).fontFamily.split(',')[0].trim().replaceAll(/['"]/g, '')
          // A control that is ticked draws no text, whatever family it is given.
          const ticked = (element: Element): boolean =>
            ['checkbox', 'radio'].includes(element.getAttribute('type') ?? '')
          const texts = [...document.querySelectorAll('body *')].filter(
            (element) =>
              (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) && !ticked(element)) ||
              [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== ''),
          )
          const other = [...new Set(texts.map(first).filter((family) => !families.includes(family)))]
          return { faces: document.fonts.size, unloaded, texts: texts.length, other }
        },
        [testFamily, secondFamily],
      )
      if (said.faces === 0 || said.unloaded > 0 || said.other.length > 0)
        throw new Error(
          `the test font did not load in ${engine}, or a text is drawn with another font (${said.other.join(', ') || 'none'}): the picture would be drawn with a font of this computer`,
        )
      if (focus !== undefined)
        await page.evaluate((selector) => {
          const found = document.querySelector(selector)
          if (found instanceof HTMLElement) found.focus()
        }, focus)
      return new Uint8Array(await page.screenshot({ animations: 'disabled', caret: 'hide' }))
    })
  })
}
