import assert from 'node:assert/strict'
import test from 'node:test'
import type { BrowserEngine, Page } from '../../../rig/browser.ts'
import { inBrowser } from '../../../rig/browser.ts'
import { alive, complaintsOf, served } from './served.ts'

/** Counts each view transition that the page starts, from before its first script. */
async function counted(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    Reflect.set(window, 'transitions', 0)
    const own = document.startViewTransition
    if (typeof own !== 'function') return
    document.startViewTransition = (...given: Parameters<typeof own>) => {
      Reflect.set(window, 'transitions', Number(Reflect.get(window, 'transitions')) + 1)
      return own.apply(document, given)
    }
  })
  return () => page.evaluate(() => Number(Reflect.get(window, 'transitions')))
}

// A WebKit engine, as a desktop window of Tauri on macOS is, ends its page in a view transition between a page that
// fits the window and a taller one: there a move changes the screens at once, as for less motion.
for (const [engine, transitions] of [
  ['chromium', 1],
  ['webkit', 0],
] as [BrowserEngine, number][])
  test(`[32-5] a move from a short screen to a tall one in ${engine} runs in ${transitions} view transition, and the page lives on`, async () => {
    const { address } = await served('laidOut')
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const count = await counted(page)
      await alive(page, `${address}/`)
      await page.locator('#tall').click()
      await page.locator('#tent h1', { hasText: 'Tall' }).waitFor()
      assert.equal(await count(), transitions)
      assert.deepEqual(said, [])
    })
  })
