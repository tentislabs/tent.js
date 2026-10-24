import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// The project of links and presses is built and served once for the tests of this file.
let common: Promise<Served> | undefined
const shop = (): Promise<Served> => {
  common ??= served('linked')
  return common
}

/** Has the page note each press that reaches the document: which element, and whether the page code took it. */
async function notesPresses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const noted: { id: string; kind: string; taken: boolean }[] = []
    Reflect.set(window, 'notedPresses', noted)
    for (const kind of ['click', 'auxclick'])
      document.addEventListener(kind, (event) => {
        const link = event.target instanceof Element ? event.target.closest('a') : null
        if (!link) return
        noted.push({ id: link.id, kind, taken: event.defaultPrevented })
        // What the browser would do with it - another tab, a saved link - is no part of the test.
        event.preventDefault()
      })
  })
}

/** The presses that reached the document since the page began to note them. */
const pressesOf = async (page: Page): Promise<{ id: string; kind: string; taken: boolean }[]> =>
  JSON.parse(await page.evaluate(() => JSON.stringify(Reflect.get(window, 'notedPresses'))))

for (const engine of browserEngines) {
  test(`[30-2] a press on a Link moves inside the page, and a press with a key held, a middle press and a target are the browser's, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/`)
      await notesPresses(page)
      await page.locator('#plain').click({ modifiers: ['Shift'] })
      await page.locator('#plain').click({ button: 'middle' })
      await page.locator('#blank').click()
      assert.equal(new URL(page.url()).pathname, '/')
      assert.deepEqual(await pressesOf(page), [
        { id: 'plain', kind: 'click', taken: false },
        { id: 'plain', kind: 'auxclick', taken: false },
        { id: 'blank', kind: 'click', taken: false },
      ])
      // A plain press is taken by the page code, which moves to the screen without loading the document.
      await page.evaluate(() => Reflect.set(window, 'sameDocument', true))
      await page.locator('#plain').click()
      await page.locator('h1', { hasText: 'Notes' }).waitFor()
      assert.equal(new URL(page.url()).pathname, '/notes')
      assert.equal(await page.evaluate(() => Reflect.get(window, 'sameDocument')), true)
      assert.deepEqual((await pressesOf(page)).at(-1), { id: 'plain', kind: 'click', taken: true })
      assert.deepEqual(said, [])
    })
  })

  test(`[30-2] set beside to changes the state, then moves, and set alone changes it with no move, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/`)
      await page.locator('#staying').click()
      assert.equal(new URL(page.url()).pathname, '/')
      await page.locator('#setting').click()
      await page.locator('h1', { hasText: 'Notes' }).waitFor()
      assert.equal(await page.locator('#seen').textContent(), 'from home')
      assert.deepEqual(said, [])
    })
  })

  test(`[30-3] a Link, useGoTo and then each refuse an address that leads to another site, and make no move, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const asked: string[] = []
      page.on('request', (request) => asked.push(request.url()))
      await alive(page, `${address}/`)
      assert.equal(await page.locator('#evil').getAttribute('href'), null)
      await page.locator('#evil').click()
      await alive(page, `${address}/presses`)
      for (const id of ['#goBackslash', '#goTab', '#goDouble']) await page.locator(id).click()
      await page.locator('input[name="words"]').fill('away')
      await page.locator('#sendAway').click()
      await page.waitForFunction(() => document.querySelector('form[aria-busy]') === null)
      await page.waitForTimeout(300)
      assert.equal(new URL(page.url()).pathname, '/presses')
      assert.deepEqual(
        asked.filter((one) => one.includes('evil')),
        [],
      )
    })
  })

  test(`[30-6] useCall is busy while under way, holds what the last call failed with and nothing while the next is under way, and its value once it worked, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      // Each call is held until the test lets it go on.
      const held: (() => void)[] = []
      await page.route('**/_t/call/**', async (route) => {
        await new Promise<void>((done) => held.push(done))
        await route.continue()
      })
      const release = async (): Promise<void> => {
        while (!held.length) await page.waitForTimeout(20)
        held.shift()?.()
      }
      await alive(page, `${address}/presses`)
      await page.locator('#no').click()
      await page.waitForFunction(() => document.querySelector('#busy')?.textContent === 'true')
      assert.equal(await page.locator('#yes').isDisabled(), true)
      await release()
      await page.waitForFunction(() => document.querySelector('#error')?.textContent === 'This is refused.')
      assert.equal(await page.locator('#busy').textContent(), 'false')
      await page.locator('#yes').click()
      await page.waitForFunction(() => document.querySelector('#busy')?.textContent === 'true')
      assert.equal(await page.locator('#error').textContent(), '')
      await release()
      await page.waitForFunction(() => document.querySelector('#value')?.textContent === 'yes')
      assert.equal(await page.locator('#error').textContent(), '')
      // The browser writes the status of the call that was refused, as it writes that of any address.
      assert.deepEqual(
        said.filter((one) => !/Failed to load resource/.test(one)),
        [],
      )
    })
  })

  test(`[30-6] useCall is held and busy while the network is cut, and neither once it is back and the call has gone through, in ${engine}`, async () => {
    const at = await shop()
    const helds = async (): Promise<number> => {
      const rows: unknown = await at.app.call('allNotes', {}, { as: { kind: 'system' } })
      return (Array.isArray(rows) ? rows : []).filter((row) => Object(row).words === 'held').length
    }
    await inBrowser(engine, async (page) => {
      await alive(page, `${at.address}/presses`)
      const before = await helds()
      assert.equal(await page.locator('#held').textContent(), 'false false')
      await page.context().setOffline(true)
      await page.waitForFunction(() => !navigator.onLine)
      await page.locator('#addHeld').click()
      // Held for want of a connection, and busy too, and nothing is sent.
      await page.waitForFunction(() => document.querySelector('#held')?.textContent === 'true true')
      await page.waitForTimeout(300)
      assert.equal(await helds(), before, 'a held call is not sent')
      await page.context().setOffline(false)
      await page.waitForFunction(() => document.querySelector('#held')?.textContent === 'false false')
      assert.equal(await helds(), before + 1, 'the held call went through once the network was back')
    })
  })

  test(`[30-6] calls of an entry with wait: false is busy until it has answered, and then of a Form, written as an arrow, goes to a screen with a value of the answer, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const first = await (await fetch(`${address}/notes`)).text()
      assert.match(first, /<p id="later">waiting<\/p>/)
      await alive(page, `${address}/notes`)
      await page.waitForFunction(() => document.querySelector('#later')?.textContent === 'came later')
      await page.locator('input[name="words"]').fill(`a note in ${engine}`)
      await page.locator('#send').click()
      await page.waitForFunction(
        (wanted) => document.querySelector('#note')?.textContent === wanted,
        `a note in ${engine}`,
      )
      assert.match(new URL(page.url()).pathname, /^\/notes\/[0-9a-z]{26}$/)
      assert.deepEqual(said, [])
    })
  })
}
