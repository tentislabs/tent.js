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

/** An element of one use of a component: the use by the name it was given, and the element by its `id` in it. */
const inUse = (page: Page, use: string, id: string) => page.locator(`[id="${use}"]`).locator(`[id="${id}"]`)

/** What the uses of the pager show, the upper one first: its page, and whether it is open. */
const pagers = async (page: Page): Promise<string[]> => [
  `${await inUse(page, 'top', 'shown').textContent()} ${await inUse(page, 'top', 'toggle').textContent()}`,
  `${await inUse(page, 'low', 'shown').textContent()} ${await inUse(page, 'low', 'toggle').textContent()}`,
]

/** Waits until the uses of the pager show what is given. */
async function shows(page: Page, wanted: string[]): Promise<void> {
  for (let tries = 0; tries < 50; tries++) {
    if (JSON.stringify(await pagers(page)) === JSON.stringify(wanted)) return
    await page.waitForTimeout(100)
  }
  assert.deepEqual(await pagers(page), wanted)
}

for (const engine of browserEngines) {
  test(`[31-8] each use of a component has its own state, a state that it keeps in the address is kept under the id of its use and comes back after a reload, and the back button undoes it, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/pagers`)
      await shows(page, ['1 shut', '1 shut'])
      // The screen is shown inside the component it names, which is told the screen it wraps.
      assert.equal(await page.locator('main > [id="where"]').textContent(), 'pagersScreen /pagers')
      assert.equal(await page.locator('main [id="page"]').count(), 1)
      await inUse(page, 'top', 'more').click()
      await inUse(page, 'top', 'more').click()
      await inUse(page, 'top', 'toggle').click()
      await shows(page, ['3 open', '1 shut'])
      assert.equal(new URL(page.url()).search, '?top~page=3')
      await inUse(page, 'low', 'more').click()
      await shows(page, ['3 open', '2 shut'])
      assert.equal(new URL(page.url()).search, '?top~page=3&low~page=2')
      // The back button walks back through the steps: the state that lives in the page stays as it is.
      await page.goBack()
      await shows(page, ['3 open', '1 shut'])
      await page.goBack()
      await shows(page, ['2 open', '1 shut'])
      assert.deepEqual(said, [])
    })
    // The first HTML of the address holds the state of each use, and a misfit is the default.
    await inBrowser(
      engine,
      async (page) => {
        await page.goto(`${address}/pagers?top~page=3&low~page=2`)
        assert.deepEqual(await pagers(page), ['3 shut', '2 shut'])
        await page.goto(`${address}/pagers?top~page=77&low~page=x`)
        assert.deepEqual(await pagers(page), ['1 shut', '1 shut'])
      },
      { scripts: false },
    )
  })
}
