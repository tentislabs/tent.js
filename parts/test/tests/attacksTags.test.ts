import assert from 'node:assert/strict'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// The attacks of the reviewer on the tags: what a form sent with no script does with its `then`, and what a
// `then` that leaves for another address may reach. The project is built and served once for the file.
let common: Promise<Served> | undefined
const shop = (): Promise<Served> => {
  common ??= served('tagged')
  return common
}

/** The id of each note, by its text. */
async function idsOf(at: Served): Promise<Record<string, string>> {
  const rows: unknown[] = Object(await at.app.read({ from: 'notes' }, { as: 'system' }))
  return Object.fromEntries(rows.map((row) => [String(Object(row).note), String(Object(row).id)]))
}

test('[32-2] with no script, a form with no id below a list of forms with ids goes where its then names after a send that adds a row to the list', async () => {
  const at = await shop()
  await at.app.write(
    [
      { add: 'notes', values: { note: 'first' } },
      { add: 'notes', values: { note: 'second' } },
    ],
    { as: 'system' },
  )
  await inBrowser(
    'chromium',
    async (page) => {
      await page.goto(`${at.address}/notes`)
      await page.locator('#note').fill('third')
      await page.locator('#add').click()
      await page.waitForLoadState('load')
      assert.ok(Object.hasOwn(await idsOf(at), 'third'), 'the call was made')
      // The form that was sent is the one whose then is followed: the list above it grew by the row it added.
      assert.equal(new URL(page.url()).pathname, '/added')
    },
    { scripts: false },
  )
})

test('[32-2] with no script, a form on the screen of a row that removes the row goes where its then names', async () => {
  const at = await shop()
  await at.app.write([{ add: 'notes', values: { note: 'doomed' } }], { as: 'system' })
  const id = (await idsOf(at)).doomed
  await inBrowser(
    'chromium',
    async (page) => {
      await page.goto(`${at.address}/notes/${id}`)
      await page.locator('h1', { hasText: 'doomed' }).waitFor()
      await page.locator('#dropIt').click()
      await page.waitForLoadState('load')
      assert.ok(!Object.hasOwn(await idsOf(at), 'doomed'), 'the call was made')
      // A send that worked goes where its then names, though the screen it was sent from no longer draws the form.
      assert.equal(new URL(page.url()).pathname, '/notes')
    },
    { scripts: false },
  )
})

test('[05-4.5] a then whose href is javascript in capitals, with room and with a line break, data or vbscript leads nowhere after a send that worked, and runs nothing', async () => {
  const at = await shop()
  await inBrowser('chromium', async (page) => {
    const said = complaintsOf(page)
    const asked: string[] = []
    page.on('request', (request) => asked.push(request.url()))
    await alive(page, `${at.address}/leaving`)
    for (let k = 0; k < 6; k++) {
      const before = Object.keys(await idsOf(at)).filter((note) => note === `leave ${k}`).length
      await page.locator(`#go-${k}`).click()
      // The send is made, and once it has worked the page stays where it is.
      for (let tries = 0; tries < 200; tries++) {
        if (Object.keys(await idsOf(at)).filter((note) => note === `leave ${k}`).length > before) break
        await new Promise((done) => setTimeout(done, 25))
      }
      await page.waitForFunction((n) => document.querySelector(`#leave-${n}`)?.getAttribute('aria-busy') === null, k)
      assert.equal(new URL(page.url()).pathname, '/leaving', `then ${k}`)
      assert.equal(await page.evaluate(() => Reflect.get(window, 'ran')), undefined, `then ${k}`)
    }
    assert.deepEqual(said, [])
    // The last form leaves for an address of another site that it may: the page does follow an href it is given.
    assert.ok(!asked.some((one) => one.startsWith('https://example.com/')))
    await page.locator('#go-6').click()
    await page.waitForEvent('request', (request) => request.url() === 'https://example.com/left')
  })
})
