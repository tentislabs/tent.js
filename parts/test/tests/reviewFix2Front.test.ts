import assert from 'node:assert/strict'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import { alive, complaintsOf, served } from './served.ts'

// Edge on an iPhone or an iPad is WebKit, as every browser there is, and names itself `EdgiOS`.
const edgeOnIos =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/117.0.2045.65 Mobile/15E148 Safari/605.1.15'

test('[32-5] a move from a short screen to a tall one in a WebKit engine that names itself EdgiOS runs in no view transition', async () => {
  const { address } = await served('laidOut')
  await inBrowser('webkit', async (page) => {
    const said = complaintsOf(page)
    await page.addInitScript((agent: string) => {
      Object.defineProperty(navigator, 'userAgent', { get: () => agent })
      Reflect.set(window, 'transitions', 0)
      const own = document.startViewTransition
      if (typeof own !== 'function') return
      document.startViewTransition = (...given: Parameters<typeof own>) => {
        Reflect.set(window, 'transitions', Number(Reflect.get(window, 'transitions')) + 1)
        return own.apply(document, given)
      }
    }, edgeOnIos)
    await alive(page, `${address}/`)
    await page.locator('#tall').click()
    await page.locator('#tent h1', { hasText: 'Tall' }).waitFor()
    assert.equal(await page.evaluate(() => Number(Reflect.get(window, 'transitions'))), 0)
    assert.deepEqual(said, [])
  })
})
