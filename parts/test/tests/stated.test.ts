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

/** An element of the page by the `id` that its view gives it. */
const byId = (page: Page, id: string) => page.locator(`[id="${id}"]`)

/** What an element of the page shows as text. */
const said = async (page: Page, id: string): Promise<string> => (await byId(page, id).textContent()) ?? ''

/** What stands after the question mark of the address that the browser shows. */
const search = (page: Page): string => new URL(page.url()).search

/** Waits until an element shows a text. */
const shows = (page: Page, id: string, text: string): Promise<unknown> =>
  page.waitForFunction(([at, wanted]) => document.querySelector(`[id="${at}"]`)?.textContent === wanted, [id, text])

for (const engine of browserEngines) {
  test(`[31-8] set on address state replaces the address, with back: true the back button undoes it, a state with reset goes back to its default, and an entry of data whose input reads a state is asked again, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const complaints = complaintsOf(page)
      await alive(page, `${address}/desk`)
      assert.equal(await said(page, 'at'), 'tool 1')
      assert.equal(await said(page, 'list'), 'SawDrill')
      // A press changes the state, the address follows, and the entry that reads the state is asked again.
      await byId(page, 'toys').click()
      await shows(page, 'list', 'Kite')
      assert.equal(search(page), '?kind=toy')
      await byId(page, 'next').click()
      await byId(page, 'next').click()
      await shows(page, 'at', 'toy 3')
      assert.equal(search(page), '?kind=toy&page=3')
      // The page number goes back to its default when the tab changes, in the same step: a default is left out.
      await byId(page, 'tools').click()
      await shows(page, 'at', 'tool 1')
      await shows(page, 'list', 'SawDrill')
      assert.equal(search(page), '')
      // The back button walks back through the steps, and each step sets every state as it is written.
      await page.goBack()
      await shows(page, 'at', 'toy 3')
      await shows(page, 'list', 'Kite')
      await page.goBack()
      await shows(page, 'at', 'toy 2')
      await page.goForward()
      await shows(page, 'at', 'toy 3')
      // The page was never loaded anew: it is the page that came alive first.
      assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1)
      assert.deepEqual(complaints, [])
    })
  })

  test(`[31-8] a value in the address is read against its type and a misfit gives the default, and the first HTML holds what the address says, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(
      engine,
      async (page) => {
        await page.goto(`${address}/desk?kind=toy&page=4`)
        assert.equal(await said(page, 'at'), 'toy 4')
        assert.equal(await said(page, 'list'), 'Kite')
        await page.goto(`${address}/desk?kind=gone&page=77&name=Saw`)
        assert.equal(await said(page, 'at'), 'tool 1')
        assert.equal(await said(page, 'found'), 'Saw')
      },
      { scripts: false },
    )
  })

  test(`[31-8] a state kept in the device is in the first HTML of the next visit, and one kept in the browser is put in when the page comes alive, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const complaints = complaintsOf(page)
      await alive(page, `${address}/desk`)
      assert.equal(await said(page, 'wasSeen'), 'new')
      assert.equal(await said(page, 'mode'), 'auto')
      await byId(page, 'see').click()
      await shows(page, 'wasSeen', 'seen')
      // A state of the project that the device keeps, as a visitor's choice of light or dark.
      await byId(page, 'dark').click()
      await shows(page, 'mode', 'dark')
      await byId(page, 'draft').fill('Dear all')
      await byId(page, 'look').click()
      await shows(page, 'looked', '2')
      // The one cookie of the app holds the device states, and nothing else.
      const cookies = (await page.context().cookies()).filter((one) => one.name.startsWith('tent_state.'))
      assert.deepEqual(
        cookies.map((one) => one.name),
        ['tent_state.shop'],
      )
      // The first HTML of the next visit already knows the device states, and not what the browser keeps.
      const first = await page.evaluate(
        async (at) => (await fetch(at, { credentials: 'same-origin' })).text(),
        `${address}/desk`,
      )
      assert.match(first, />dark<\/span>/)
      assert.match(first, />seen<\/span>/)
      assert.ok(!first.includes('Dear all'))
      assert.match(first, />0<\/span>/)
      // The page that comes alive puts in what the browser kept.
      await alive(page, `${address}/desk`)
      assert.equal(await said(page, 'wasSeen'), 'seen')
      await shows(page, 'looked', '2')
      assert.equal(await byId(page, 'draft').inputValue(), 'Dear all')
      assert.equal(await said(page, 'mode'), 'dark')
      assert.deepEqual(complaints, [])
    })
  })
}
