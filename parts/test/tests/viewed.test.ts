import assert from 'node:assert/strict'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import { complaintsOf, served } from './served.ts'

test('[12-3@9a] a view that holds value words is worked out in a browser: the page code loads no part of the server, and the words answer their values', async () => {
  for (const build of ['release', 'dev'] as const) {
    const { address, description } = await served('viewed', { for: build })
    assert.equal(
      JSON.stringify(description.screens.valuedScreen).includes('"code"'),
      false,
      'nothing of the screen is code',
    )
    await inBrowser('chromium', async (page) => {
      const said = complaintsOf(page)
      await page.goto(`${address}/valued`)
      await page.getByText('QUIET', { exact: true }).waitFor()
      assert.deepEqual(await page.locator('[id="open"]').allTextContents(), ['a'])
      // Opened by a link that the page follows itself, the view is worked out by the page code in the browser.
      await page.goto(`${address}/start`)
      await page.getByText('Go', { exact: true }).click()
      await page.getByText('QUIET', { exact: true }).waitFor()
      assert.deepEqual(await page.locator('[id="open"]').allTextContents(), ['a'])
      assert.deepEqual(said, [], build)
    })
  }
})

test('[32-4@9a] a screen whose state is kept in the address with the default today draws while the address names no day, with the day of today', async () => {
  const { address } = await served('viewed')
  const plain = await fetch(`${address}/dated`)
  assert.equal(plain.status, 200, await plain.clone().text())
  assert.match(await plain.text(), /\d{4}-\d{2}-\d{2}/)
  const named = await fetch(`${address}/dated?day=2026-10-15`)
  assert.equal(named.status, 200)
  assert.match(await named.text(), /2026-10-15/)
})

test('[31-7@9a] a needed entry whose query fails as not found draws the screen that is not found, with 404, and not the error screen', async () => {
  const { address } = await served('viewed')
  const here = await fetch(`${address}/things/here`)
  assert.equal(here.status, 200)
  assert.match(await here.text(), /A thing/)
  const gone = await fetch(`${address}/things/gone`)
  assert.equal(gone.status, 404, await gone.clone().text())
})
