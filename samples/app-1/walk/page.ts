import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type BrowserType,
  chromium,
  firefox,
  type Page,
  webkit,
} from 'playwright-core'

export const ENGINES: Record<string, BrowserType> = { chromium, firefox, webkit }

// WALK_ENGINES=firefox,webkit walks in those alone. Left out, the walk is made in all three.
export const asked = (process.env.WALK_ENGINES ?? 'chromium,firefox,webkit').split(',').map((name) => name.trim())

// WALK_MOTION=reduce walks as a person who asked the device for less motion, with no view transition between screens.
const motion = process.env.WALK_MOTION === 'reduce' ? 'reduce' : 'no-preference'

export const SAM = 'sam@shop.example'
export const DANA = 'dana@shop.example'
export const ADA = 'ada@example.com'
export const GRACE = 'grace@example.com'
// The password that the seed gives every person, on data of development and of test.
export const PASSWORD = 'a long secret'

/** The engine that a name of WALK_ENGINES names. */
export function engineOf(name: string): BrowserType {
  const found = ENGINES[name]
  if (!found) throw new Error(`WALK_ENGINES names "${name}", which is none of chromium, firefox and webkit.`)
  return found
}

/** A window of the browser as a person in the United States has it, which reaches nothing but the app. */
export async function contextOf(browser: Browser, options: BrowserContextOptions = {}): Promise<BrowserContext> {
  const context = await browser.newContext({
    locale: 'en-US',
    timezoneId: 'UTC',
    acceptDownloads: true,
    reducedMotion: motion,
    ...options,
  })
  await context.route(
    (url) => url.hostname !== 'localhost',
    (route) => route.abort(),
  )
  return context
}

// A page takes a press only once its code has loaded: the drawing carries this mark from then on.
export const alive = (page: Page) => page.locator('#tent[data-t-alive]').waitFor()

export async function signIn(page: Page, email: string): Promise<void> {
  await alive(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Signs a page in as a person of the seed through the app's own sign-in screen, which leads it on to `to`. */
export async function signedInAt(page: Page, address: string, email: string, to: string): Promise<void> {
  await page.goto(`${address}/sign-in?back=${encodeURIComponent(to)}`)
  await signIn(page, email)
  await page.waitForURL((url) => `${url.pathname}${url.search}` === to)
}

/** Waits until nothing on the page moves: the fonts are in, and every transition, animation and view transition that ends has ended. */
export async function stillness(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
    const moving = () =>
      document.getAnimations().filter((one) => {
        const timing = one.effect?.getComputedTiming()
        return one.playState === 'running' && timing?.iterations !== Number.POSITIVE_INFINITY
      })
    for (let round = 0; round < 40 && moving().length > 0; round++)
      await Promise.all(moving().map((one) => one.finished.catch(() => undefined)))
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
}

/** A picture of the whole page once it is still. */
export async function pictureOf(page: Page, path: string): Promise<void> {
  await stillness(page)
  await page.screenshot({ path, fullPage: true })
}
