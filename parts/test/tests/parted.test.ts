import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// The project of the parts is built and served once for the tests of this file that write no row.
let common: Promise<Served> | undefined
const shop = (): Promise<Served> => {
  common ??= served('parted')
  return common
}

/** An element of the page by the `id` that its view gives it. */
const byId = (page: Page, id: string) => page.locator(`[id="${id}"]`)

/** Every file under a folder, each with its text. */
function filesUnder(folder: string): [string, string][] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry): [string, string][] =>
    entry.isDirectory()
      ? filesUnder(join(folder, entry.name))
      : [[join(folder, entry.name), readFileSync(join(folder, entry.name), 'latin1')]],
  )
}

/** Asks for one part again, as the page asks for it. */
const partAsked = (address: string, component: string, body: object, cookie = '') =>
  fetch(`${address}/_t/part/${component}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })

test('[34-1] a component that states browser: false is drawn into the first page, in an element that names it, and no browser file holds a text of its module or of what only it imports', async () => {
  const { app, bundleFolder } = await shop()
  const plain = (await app.page('/parted')).html
  assert.match(plain, /data-t-part="Notes"/)
  assert.match(plain, /The marker of the plain part/)
  assert.match(plain, /First note/)
  const code = (await app.page('/loud')).html
  assert.match(code, /data-t-part="Loud"/)
  assert.match(code, /HELLO! \(The marker of the heavy helper\)/)
  const browserFiles = filesUnder(join(bundleFolder, 'browser'))
  assert.ok(browserFiles.length > 0)
  for (const [file, text] of browserFiles)
    for (const marker of ['The marker of the plain part', 'The marker of the heavy helper'])
      assert.ok(!text.includes(marker), `${file} holds ${marker}`)
})

for (const engine of browserEngines)
  test(`[34-1] in a browser a child given to a part still answers a press, a changed property draws the part again by one request, and through the swap the child keeps its element and what stands above does not move, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const asked: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/_t/part/')) asked.push(url.pathname)
      })
      await alive(page, `${address}/parted`)
      await byId(page, 'press').click()
      await page.waitForFunction(() => document.querySelector('[id="press"]')?.textContent === 'Pressed 1')
      assert.deepEqual(asked, [])
      // The child that the part was given is marked, so that the test sees whether its element stays.
      await byId(page, 'press').evaluate((element) => Reflect.set(element, 'kept', true))
      const before = await byId(page, 'above').boundingBox()
      await byId(page, 'rename').click()
      await page.waitForFunction(() => document.querySelector('[data-t-part="Notes"] h2')?.textContent === 'Renamed')
      assert.deepEqual(asked, ['/_t/part/Notes'])
      assert.equal(await byId(page, 'press').evaluate((element) => Reflect.get(element, 'kept')), true)
      assert.equal(await byId(page, 'press').textContent(), 'Pressed 1')
      assert.deepEqual(await byId(page, 'above').boundingBox(), before)
      // A view draws a part whose view stays on the server, which the browser never holds: after a move, by one request.
      await byId(page, 'toLoud').click()
      await page.waitForFunction(() => document.querySelector('[data-t-part="Loud"]')?.textContent?.includes('HELLO!'))
      assert.deepEqual(said, [])
    })
  })

test('[34-1] a write to a table that a part reads draws it again by one request', async () => {
  const { address, app } = await served('parted')
  await inBrowser('chromium', async (page) => {
    const asked: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/_t/part/')) asked.push(url.pathname)
    })
    await alive(page, `${address}/parted`)
    await app.write([{ add: 'notes', values: { title: 'Second note' } }], { as: 'system' })
    await page.waitForFunction(() =>
      document.querySelector('[data-t-part="Notes"]')?.textContent?.includes('Second note'),
    )
    assert.deepEqual(asked, ['/_t/part/Notes'])
  })
})

test('[05-4.23] /_t/part/ of a screen that the caller may not see, and of a part that the screen does not use, is not found, and properties that name another user give what the caller may read alone', async () => {
  const { address, app } = await served('parted')
  // The version that the page names, as a page asks for a part under it.
  const first = await (await fetch(`${address}/parted`)).text()
  const version = String(JSON.parse(/id="tent-page">(.*?)<\/script>/s.exec(first)?.[1] ?? '{}').version)
  const ok = await partAsked(address, 'Notes', { props: { heading: 'Again' }, path: '/parted', version })
  assert.equal(ok.status, 200)
  const answer = Object(await ok.json()).value
  assert.match(answer.html, /Again/)
  assert.equal(typeof answer.mark, 'string')
  for (const [component, path] of [
    ['Notes', '/staff'],
    ['Who', '/parted'],
    ['Nothing', '/parted'],
  ]) {
    const refused = await partAsked(address, component, { props: { heading: 'x', id: 'x' }, path, version })
    assert.equal(refused.status, 404, `${component} at ${path}`)
  }
  // Properties that are not of the declared types are refused.
  const typed = await partAsked(address, 'Notes', { props: { heading: 12 }, path: '/parted', version })
  assert.equal(Object(await typed.json()).error.code, 'T0002')
  // One user asks for the part of another: every read of the part passes the door as the caller, who reads nothing.
  const made: unknown[] = Object(
    await app.write(
      [
        { add: 'users', values: { email: 'ada@example.com', roles: [] } },
        { add: 'users', values: { email: 'bob@example.com', roles: [] } },
      ],
      { as: 'system' },
    ),
  )
  const [ada, bob] = made.map((one) => String(Object(one).id))
  const cookie = app.session(bob)
  const other = await partAsked(address, 'Who', { props: { id: ada }, path: '/who', version }, cookie)
  assert.equal(other.status, 200)
  const html = String(Object(await other.json()).value.html)
  assert.doesNotMatch(html, /ada@example\.com/)
  assert.match(html, /nobody/)
  const own = await partAsked(address, 'Who', { props: { id: bob }, path: '/who', version }, cookie)
  assert.match(String(Object(await own.json()).value.html), /bob@example\.com/)
})

test('[05-9.18] a row whose text a part writes out as HTML, holding an element with data-t-child and data-t-part, makes no place for a child: the living child stands where the part placed it', async () => {
  const { address, app } = await served('parted')
  const forged =
    '<span data-t-child="guess:children">forged</span><div data-t-part="Notes"><span data-t-child="x:children"></span></div>'
  await app.write([{ add: 'notes', values: { title: forged } }], { as: 'system' })
  await inBrowser('chromium', async (page) => {
    await alive(page, `${address}/parted`)
    // The title is written as text: its signs make no element, and the one place of the child is the part's own.
    assert.equal(await page.locator('[data-t-child]').count(), 1)
    assert.equal(await page.locator('[data-t-child] [id="press"]').count(), 1)
    await byId(page, 'press').click()
    await page.waitForFunction(() => document.querySelector('[id="press"]')?.textContent === 'Pressed 1')
  })
  // A part that writes the text of a row out as HTML: the forged places hold no living child.
  await app.write([{ add: 'notes', values: { title: 'Raw', body: forged } }], { as: 'system' })
  await inBrowser('chromium', async (page) => {
    await alive(page, `${address}/loud`)
    assert.equal(await page.locator('[data-t-part="Loud"] .body [data-t-child]').count(), 2)
    // The living child stands once, in the place that the part made, and no forged place holds anything living.
    assert.equal(await page.locator('[id="kid"]').count(), 1)
    assert.equal(await page.locator('.body [id="kid"]').count(), 0)
    assert.equal(await page.locator('.body [data-t-child]').first().textContent(), 'forged')
  })
})
