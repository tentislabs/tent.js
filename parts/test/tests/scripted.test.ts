import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { complaintsOf, served } from './served.ts'

// The project of the site is built and served once for the tests of this file.
let common: Promise<Served> | undefined
const site = (): Promise<Served> => {
  common ??= served('scripted')
  return common
}

/** What the scripts of the page ran so far, in their order. */
const ran = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const said: unknown = Reflect.get(window, 'ran')
    return Array.isArray(said) ? said.map(String) : []
  })

/** Every script that the page asked for so far, by the name of its file, from the moment it was opened. */
function asked(page: Page): string[] {
  const all: string[] = []
  page.on('request', (request) => {
    const named = /\/assets\/(alive|idle|consented|shared|other)\.[^/]*js$/.exec(new URL(request.url()).pathname)
    if (named) all.push(named[1])
  })
  return all
}

test('[32-18] the first HTML holds none of the scripts that load later, and the content policy names their addresses', async () => {
  const { app } = await site()
  const page = await app.page('/')
  assert.equal(page.status, 200)
  assert.ok(!/<script[^>]+assets\/(alive|idle|consented|shared|other)/.test(page.html), page.html)
  assert.match(page.html, /"scripts":\[/)
})

test('[32-18] a script that loads alive is asked for only after the page lives, one that loads idle after that, and neither before the first paint, in the three browsers', async () => {
  const { address } = await site()
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const complaints = complaintsOf(page)
      const all = asked(page)
      // The page code is held back: the page is painted from its first HTML, and comes alive only when it is let go.
      const waiting: (() => void)[] = []
      let free = false
      await page.route('**/_t/b/browser/page.*.js', async (route) => {
        if (!free) await new Promise<void>((done) => waiting.push(done))
        await route.continue()
      })
      await page.goto(`${address}/`, { waitUntil: 'commit' })
      await page.getByRole('heading', { name: 'Home' }).waitFor()
      assert.deepEqual(all, [], said)
      free = true
      for (const done of waiting.splice(0)) done()
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.waitForFunction(() => {
        const said: unknown = Reflect.get(window, 'ran')
        return Array.isArray(said) && said.includes('idle')
      })
      const order = await ran(page)
      assert.ok(order.includes('alive') && order.includes('shared'), `${said}: ${order}`)
      assert.ok(order.indexOf('idle') > order.indexOf('alive'), `${said}: ${order}`)
      assert.ok(!order.includes('consented'), `${said}: ${order}`)
      assert.deepEqual(complaints, [], said)
    })
})

test('[32-18] a script that waits for consent is not asked for while its state is false, and is added on the same page when it turns true, in the three browsers', async () => {
  const { address } = await site()
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const all = asked(page)
      await page.goto(`${address}/`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.waitForFunction(() => {
        const said: unknown = Reflect.get(window, 'ran')
        return Array.isArray(said) && said.includes('idle')
      })
      assert.ok(!all.includes('consented'), said)
      const before = page.url()
      await page.getByText('Agree', { exact: true }).click()
      await page.getByText('Agreed').waitFor()
      await page.waitForFunction(() => {
        const said: unknown = Reflect.get(window, 'ran')
        return Array.isArray(said) && said.includes('consented')
      })
      assert.equal(page.url(), before, said)
      assert.deepEqual(
        all.filter((one) => one === 'consented'),
        ['consented'],
        said,
      )
    })
})

test('[32-18] a move between two screens that name one script adds it once, and the own script of a screen is added when a move first reaches it, in the three browsers', async () => {
  const { address } = await site()
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await page.goto(`${address}/`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.waitForFunction(() => {
        const said: unknown = Reflect.get(window, 'ran')
        return Array.isArray(said) && said.includes('shared')
      })
      assert.ok(!(await ran(page)).includes('other'), said)
      await page.getByText('To the other').click()
      await page.getByRole('heading', { name: 'Other' }).waitFor()
      await page.waitForFunction(() => {
        const said: unknown = Reflect.get(window, 'ran')
        return Array.isArray(said) && said.includes('other')
      })
      await page.getByText('Home again').click()
      await page.getByRole('heading', { name: 'Home' }).waitFor()
      const order = await ran(page)
      assert.deepEqual(
        order.filter((one) => one === 'shared'),
        ['shared'],
        said,
      )
      assert.equal(await page.locator('script[src*="shared"]').count(), 1, said)
    })
})
