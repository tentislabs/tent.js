import assert from 'node:assert/strict'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { alive, served } from './served.ts'

for (const engine of browserEngines) {
  test(`[32-2] what then of a Form says is dropped once the screen that sent it is no longer shown: the call goes on, in ${engine}`, async () => {
    const { address } = await served('movedAway')
    await inBrowser(engine, async (page) => {
      await alive(page, `${address}/home`)
      const answered = page.waitForResponse((response) => response.url().includes('/_t/call/slowSave'))
      await page.getByRole('button', { name: 'Save' }).click()
      await page.locator('#elsewhere').click()
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Item')
      await answered
      // A moment after the answer, the page still shows the screen it moved to.
      await page.waitForTimeout(300)
      assert.equal(await page.locator('h1').first().textContent(), 'Item')
      assert.equal(new URL(page.url()).pathname, '/items/7')
    })
  })

  test(`[32-5] a screen opened above with a side stands along that edge, in ${engine}`, async () => {
    const { address } = await served('movedAway')
    await inBrowser(engine, async (page) => {
      await alive(page, `${address}/home`)
      await page.locator('#atEnd').click()
      const dialog = page.locator('dialog[open]')
      await dialog.getByRole('heading', { name: 'Side' }).waitFor()
      const [box, width] = await Promise.all([dialog.boundingBox(), page.evaluate(() => window.innerWidth)])
      assert.ok(box, 'the dialog is drawn')
      assert.ok(Math.abs(box.x + box.width - width) <= 1, `the dialog ends at ${box.x + box.width} of ${width}`)
    })
  })

  test(`[31-4] a view that fails in the browser after a move draws the error screen over the record of the screen shown, in ${engine}`, async () => {
    const { address } = await served('movedAway')
    await inBrowser(engine, async (page) => {
      await alive(page, `${address}/home`)
      await page.locator('#elsewhere').click()
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Item')
      await page.getByRole('button', { name: 'Break' }).click()
      await page.getByRole('heading', { name: 'Failed at 7' }).waitFor()
    })
  })
}
