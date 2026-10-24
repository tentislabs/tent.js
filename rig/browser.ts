// The one file that names the driver of a real browser. A test of a part imports it, and no file that is shipped.
import type { Page } from 'playwright-core'
import { chromium, firefox, webkit } from 'playwright-core'
import { silenced } from './silence.ts'
import { secondFamily, testFamily, testFontRules } from './testFont.ts'

export type { Page } from 'playwright-core'

/** A browser engine that a test is run in. */
export type BrowserEngine = 'chromium' | 'firefox' | 'webkit'

/** The three engines, in the order a test goes through them. */
export const browserEngines: readonly BrowserEngine[] = ['chromium', 'firefox', 'webkit']

const launchers = { chromium, firefox, webkit }

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
 * engine plays sound, and what a page reads of a playing element and of a voice stays as the page set it. The
 * browser is ended when the work is done, also where it fails. Answers what the work answered.
 */
export async function inBrowser<Answer>(
  engine: BrowserEngine,
  work: (page: Page) => Promise<Answer>,
  o: { width?: number; height?: number; scripts?: boolean; device?: boolean } = {},
): Promise<Answer> {
  // No browser plays sound out of the speakers of the computer the tests run on: Chromium by its flag, Firefox by
  // its preference, and WebKit, which has neither, by what its pages run first.
  const browser = await launchers[engine].launch({
    headless: true,
    ...(engine === 'chromium'
      ? {
          args: [
            '--mute-audio',
            ...(o.device ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : []),
          ],
        }
      : {}),
    ...(engine === 'firefox'
      ? {
          firefoxUserPrefs: {
            'media.volume_scale': '0.0',
            ...(o.device ? { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true } : {}),
          },
        }
      : {}),
  })
  try {
    const context = await browser.newContext({
      viewport: { width: o.width ?? 800, height: o.height ?? 600 },
      deviceScaleFactor: 1,
      javaScriptEnabled: o.scripts !== false,
      ...(o.device ? { permissions: ['geolocation'], geolocation: { latitude: 38.42, longitude: 27.14 } } : {}),
    })
    if (engine === 'webkit') await context.addInitScript(silenced)
    await context.route(
      (url) => !isHere(url.href),
      (route) => route.abort(),
    )
    return await work(await context.newPage())
  } finally {
    await browser.close()
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
 * too. The browser is ended when the work is done, also where it fails. Answers what the work answered.
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
