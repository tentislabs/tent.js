import assert from 'node:assert/strict'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { alive, complaintsOf, served } from './served.ts'

for (const engine of browserEngines)
  test(`[32-5] going back puts the page where it was: the screen before is shown at the place it was left at, in ${engine}`, async () => {
    const { address } = await served('stated')
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/things`)
      const low = page.locator('[id="low"]')
      await low.scrollIntoViewIfNeeded()
      const left = await page.evaluate(() => scrollY)
      assert.ok(left > 500, String(left))
      await low.click()
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Drill')
      await page.waitForFunction(() => scrollY === 0)
      await page.goBack()
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Things')
      await page.waitForFunction((was) => Math.abs(scrollY - was) <= 2, left)
      assert.deepEqual(said, [])
    })
  })
