import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { openedAlive, counted, servedOrigin, shop, shownOrders } from './browsing.ts'

/** Every request that a page sends to the doors of the app from now on, as the last part of its address. */
function doorsOf(page: Page): string[] {
  const asked: string[] = []
  page.on('request', (request) => {
    const found = /\/_t\/(call|read)\/[^?]+/.exec(request.url())
    if (found) asked.push(found[0])
  })
  return asked
}

test('[31-15@5] after a call that worked the page asks again a query that is never live, and neither a live one, which the engine sends, nor the actions of its data: from two screens', async () => {
  const origin = await shop()
  for (const engine of browserEngines)
    for (const path of ['/both', '/both/code'])
      await inBrowser(engine, async (page) => {
        const said = `${path} in ${engine}`
        // While its connection is not yet open, the page asks a live query through the door: the press waits for it.
        const watching = new Promise<void>((done) =>
          page.on('websocket', (socket) =>
            socket.on('framesent', (frame) => String(frame.payload).includes('"watch"') && done()),
          ),
        )
        await openedAlive(page, `${origin}${path}`)
        const before = await shownOrders(page)
        await page.getByText('EUR 0.9').waitFor()
        await watching
        const asked = doorsOf(page)
        await page.getByRole('button', { name: 'Add one' }).click()
        await counted(page, before + 1)
        await page.getByText(`${before + 1} read once`).waitFor()
        assert.deepEqual(asked, ['/_t/call/addOrder', '/_t/read/ordersOnce'], said)
        // The answer of the action stands as the page was sent it.
        await page.getByText('EUR 0.9').waitFor()
      })
})

test('[31-4] a view that fails in the browser: the failure is taken, and the error screen of the page code is drawn, as the project has none of its own', async () => {
  const origin = await shop()
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const loaded: string[] = []
      page.on('request', (request) => loaded.push(new URL(request.url()).pathname))
      await page.goto(`${origin}/breaks`)
      // The first HTML held the drawing of the server, and the page record names no module of an `error` screen.
      const record = JSON.parse((await page.locator('#tent-page').textContent()) ?? '{}')
      assert.equal(record.load.error, '', said)
      await page.getByRole('heading', { name: 'Something went wrong' }).waitFor()
      // In the mode `test` the error is shown too.
      await page.getByText('the view broke in the browser').waitFor()
      assert.equal(await page.getByText('Drawn on the server').count(), 0, said)
      assert.ok(!loaded.some((one) => one.includes('error')), said)
    })
})

test('[31-6] useGoTo with replace puts the address in the place of the page in the history of the browser, and without it after the page', async () => {
  const origin = await shop()
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await openedAlive(page, `${origin}/press`)
      await openedAlive(page, `${origin}/moves`)
      const before = await page.evaluate(() => history.length)
      await page.getByRole('button', { name: 'In its place' }).click()
      await page.waitForURL(`${origin}/orders/new`)
      assert.equal(await page.evaluate(() => history.length), before, said)
      // The way back leads past the page that was replaced.
      await page.goBack()
      await page.waitForURL(`${origin}/press`)
      await openedAlive(page, `${origin}/moves`)
      const then = await page.evaluate(() => history.length)
      await page.getByRole('button', { name: 'After it' }).click()
      await page.waitForURL(`${origin}/orders/new`)
      assert.equal(await page.evaluate(() => history.length), then + 1, said)
    })
})

test('[31-3] when the passes of a draw are used up, an entry that is still open is asked by the browser when the page is alive, and the view shows its answer', async () => {
  const origin = await servedOrigin((written) => written.replace('limits: {', 'limits: { drawPasses: 1,'))
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const asked = doorsOf(page)
      await page.goto(`${origin}/rates`)
      const record = JSON.parse((await page.locator('#tent-page').textContent()) ?? '{}')
      assert.equal(record.screen, 'ratesScreen', said)
      const left = Object.fromEntries(
        record.answers.map((one: { entry: string; left?: string }) => [one.entry, one.left]),
      )
      assert.deepEqual(left, { rates: 'open', later: 'wait' }, said)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.getByText('EUR 0.9').waitFor()
      await page.getByText('Later 0.9').waitFor()
      assert.deepEqual([...asked].sort(), ['/_t/read/rates', '/_t/read/rates'], said)
    })
})
