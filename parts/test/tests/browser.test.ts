import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { openedAlive, servedOrigin, shop } from './browsing.ts'

test('[21-11] a page that needs an entry of unlock fails without the entry and works with it', async () => {
  // The page writes a style tag of its own and makes code from text: `styleTags` and `eval` open the two.
  const closed = await shop()
  const open = await servedOrigin((written) => {
    assert.match(written, /unlock: \{/)
    return written.replace('unlock: {', 'unlock: { styleTags: true, eval: true,')
  })
  const seen = async (page: Page, origin: string): Promise<[string, string]> => {
    await openedAlive(page, `${origin}/unlocked`)
    await page.locator('#made').filter({ hasNotText: 'waiting' }).waitFor()
    return [
      await page.locator('#styled').evaluate((element) => getComputedStyle(element).color),
      await page.locator('#made').innerText(),
    ]
  }
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const [color, made] = await seen(page, closed)
      assert.notEqual(color, 'rgb(1, 2, 3)', `the style tag is not read without its entry, in ${engine}`)
      assert.equal(made, 'refused', `code is not made from text without its entry, in ${engine}`)
      assert.deepEqual(await seen(page, open), ['rgb(1, 2, 3)', '42'], `with the two entries, in ${engine}`)
    })
})
