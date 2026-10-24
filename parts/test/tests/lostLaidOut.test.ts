import assert from 'node:assert/strict'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// The project's `notFound` screen states a layout, as every other screen of it does.
let common: Promise<Served> | undefined
const laidOut = (): Promise<Served> => {
  common ??= served('laidOut')
  return common
}

/** The record of the page that a document holds. */
function recordOf(html: string): Record<string, unknown> {
  const found = /<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)
  return Object(JSON.parse(found?.[1] ?? '{}'))
}

test('[32-8] the notFound screen of the project is drawn in its layout, and its page loads the module of that layout', async () => {
  const { app, description } = await laidOut()
  const page = await app.page('/nowhere')
  assert.equal(page.status, 404)
  assert.match(page.html, /<header id="bar">The bar<\/header><h1>Lost<\/h1>/)
  const load = Object(recordOf(page.html).load)
  const frame = String(Object(description.browser).components.Frame[0])
  assert.ok(load.parts.includes(frame), `the page loads the layout: ${JSON.stringify(load)}`)
})

test('[32-8] once the page is alive the notFound screen keeps its layout, opened whole and reached by a move inside the page', async () => {
  const { address } = await laidOut()
  await inBrowser('chromium', async (page) => {
    const said = complaintsOf(page)
    await alive(page, `${address}/nowhere`)
    assert.equal(await page.locator('#tent #bar').textContent(), 'The bar')
    assert.equal(await page.locator('#tent h1').textContent(), 'Lost')

    await alive(page, `${address}/`)
    await page.locator('#nowhere').click()
    await page.locator('#tent h1', { hasText: 'Lost' }).waitFor()
    assert.equal(await page.locator('#tent #bar').textContent(), 'The bar')
    assert.deepEqual(
      said.filter((one) => !/404/.test(one)),
      [],
    )
  })
})
