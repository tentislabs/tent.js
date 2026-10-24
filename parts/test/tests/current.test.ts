import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// The project of the states is built and served once for the tests of this file: none of them writes a row.
let common: Promise<Served> | undefined
const shop = (): Promise<Served> => {
  common ??= served('stated')
  return common
}

/** The links of the page that are current now, by their `id`. */
const current = (page: Page, ids: string[]): Promise<string[]> =>
  page.evaluate(
    (all) => all.filter((id) => document.querySelector(`[id="${id}"]`)?.getAttribute('aria-current') === 'page'),
    ids,
  )

/** Waits until the links that are current are the ones given. */
async function becomes(page: Page, ids: string[], wanted: string[]): Promise<void> {
  for (let tries = 0; tries < 50; tries++) {
    if (JSON.stringify(await current(page, ids)) === JSON.stringify(wanted)) return
    await page.waitForTimeout(100)
  }
  assert.deepEqual(await current(page, ids), wanted)
}

for (const engine of browserEngines) {
  test(`[30-4] of three tabs that are links with a with, only the one whose values are shown is current, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const tabs = ['all', 'tools', 'toys']
      await alive(page, `${address}/tabs`)
      assert.deepEqual(await current(page, tabs), ['all'])
      await page.locator('[id="toys"]').click()
      await page.waitForFunction(() => document.querySelector('[id="shown"]')?.textContent === 'toy')
      await becomes(page, tabs, ['toys'])
      // The first HTML of an address says the same.
      const first = await (await fetch(`${address}/tabs?kind=tool`)).text()
      assert.match(first, /<a [^>]*aria-current="page"[^>]*>Tools<\/a>/)
      assert.equal((first.match(/aria-current="page"/g) ?? []).length, 1)
      assert.deepEqual(said, [])
    })
  })
}
