import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// The project of the value words is built and served once for the tests of this file: none of them writes a row.
let common: Promise<Served> | undefined
const shop = (): Promise<Served> => {
  common ??= served('valued')
  return common
}

/** What each value word answers for the rows of the seed, by the `id` of the element that shows it. */
const answers: Record<string, string> = {
  words: 'n3true',
  calc: '42',
  round: '8.2',
  floor: '2',
  ceil: '3',
  least: '2',
  most: '9',
  lower: 'abc',
  upper: 'ABC',
  trim: '[x]',
  startsWith: 'yes',
  contains: 'yes',
  slice: 'bcde',
  join: '1-2-3',
  range: '10 7 4 1',
  where: '2',
  sum: '24.5',
  avg: String(24.5 / 3),
  min: '5',
  max: '12',
  each: '24,10,15',
  later: '2026-02-28',
  earlier: '2026-02-28',
  between: '1',
  // A moment late in the evening in UTC is the next day in the zone of the page.
  dayOf: '2026-10-09',
}

/** The words of each element that shows a value word on a living page, by its `id`. */
async function shownOn(page: Page): Promise<Record<string, string>> {
  const shown: Record<string, string> = {}
  for (const name of Object.keys(answers)) shown[name] = (await page.locator(`[id="${name}"]`).textContent()) ?? ''
  return shown
}

for (const engine of browserEngines)
  test(`[12-6] each value word that a view may hold answers in the browser what it answers in the first HTML, on two screens, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/words`)
      assert.deepEqual(await shownOn(page), answers)
      // Each screen drawn by the browser after a move, the second first and then the first.
      await page.locator('[id="toStateful"]').click()
      await page.waitForURL(`${address}/stateful`)
      await page.locator('[id="toWords"]').waitFor()
      assert.deepEqual(await shownOn(page), answers)
      await page.locator('[id="toWords"]').click()
      await page.waitForURL(`${address}/words`)
      await page.locator('[id="toStateful"]').waitFor()
      assert.deepEqual(await shownOn(page), answers)
      assert.deepEqual(said, [])
    })
  })
