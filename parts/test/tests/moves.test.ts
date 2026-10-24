import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

/**
 * A screen whose view reads \`above\`: above, it draws a component whose data reads a query, and as a page a heading.
 * Its state in the address is its own. A screen beside it opens it above.
 */
const peeked = `import { component, screen, choice, read, text, Link } from 'tentjs/ui'
import { itemNamed } from './functions'

export const Kind = component('Kind', {
  props: { name: text() },
  data: ({ props }) => ({ thing: read(itemNamed, { name: props.name }) }),
  view: ({ thing }) => <span id="kind">{thing ? thing.kind : 'none'}</span>,
})

export const peekScreen = screen('peekScreen', {
  path: '/peek/:name',
  access: 'anyone',
  title: 'A peek',
  cache: '5 minutes',
  state: { side: { type: choice(['front', 'back'], { default: 'front' }), in: 'address' } },
  view: ({ above, params, state }) => (
    <div id="peek" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {above ? <Kind name={params.name} /> : <h1>{params.name} as a page</h1>}
      <Link set={{ side: 'back' }} id="side">{state.side}</Link>
    </div>
  ),
})

export const peeksScreen = screen('peeksScreen', {
  path: '/peeks',
  access: 'anyone',
  title: 'Peeks',
  view: () => (
    <div id="peeks" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <h1>Peeks</h1>
      <Link to="/peek/Kite" above id="toPeek">Peek</Link>
    </div>
  ),
})
`

let peeking: Promise<Served> | undefined
const peeks = (): Promise<Served> => {
  peeking ??= served('stated', { change: (folder) => writeFileSync(join(folder, 'peeked.tsx'), peeked) })
  return peeking
}

/** A screen with a link far down that prefetches when it comes into view, and one that is hovered. */
const farLinks = `import { screen, Link } from 'tentjs/ui'

export const farScreen = screen('farScreen', {
  path: '/far',
  access: 'anyone',
  title: 'Far',
  view: () => (
    <div id="far" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <h1>Far</h1>
      <Link to="/things/Saw" id="near">The saw</Link>
      <div style={{ height: 3000 }} />
      <Link to="/things/Kite" id="seen" prefetch="view">The kite, far down</Link>
    </div>
  ),
})
`

/** The project of the states with limits of its own for what a page prefetches and how long a move waits. */
let limited: Promise<Served> | undefined
const limitedShop = (): Promise<Served> => {
  limited ??= served('stated', {
    change: (folder) => {
      const file = join(folder, 'tent.ts')
      const text = readFileSync(file, 'utf8')
      const from = 'limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },'
      assert.ok(text.includes(from))
      writeFileSync(
        file,
        text.replace(
          from,
          "limits: { anyonePerMinute: 100000, screensPerMinute: 100000, loadingAfter: '1 second', prefetchKept: '300 ms', prefetchAtOnce: 2 },",
        ),
      )
      writeFileSync(join(folder, 'far.tsx'), farLinks)
    },
  })
  return limited
}

test('[32-6] the page record holds loadingAfter, prefetchKept and prefetchAtOnce where the project states its own, in milliseconds, and none of them where it states none', async () => {
  const record = async (at: Served): Promise<Record<string, unknown>> => {
    const html = (await at.app.page('/things')).html
    return JSON.parse(/<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)?.[1] ?? 'null')
  }
  const own = await record(await limitedShop())
  assert.deepEqual([own.loadingAfter, own.prefetchKept, own.prefetchAtOnce], [1000, 300, 2])
  const usual = await record(await shop())
  assert.deepEqual([usual.loadingAfter, usual.prefetchKept, usual.prefetchAtOnce], [undefined, undefined, undefined])
})

test('[32-5] /_t/screen asked with above=1 draws the view with above as true, and meets what that branch reads; the cache keeps the answers with and without above apart', async () => {
  const { address } = await peeks()
  const asked = async (more: string): Promise<{ what: string }[]> => {
    const answer = await fetch(`${address}/_t/screen?path=${encodeURIComponent('/peek/Kite')}${more}`)
    return Object(await answer.json()).value.answers
  }
  // Asked first without above, the answer is kept: the one with above is another all the same.
  assert.deepEqual(await asked(''), [])
  assert.deepEqual(
    (await asked('&above=1')).map((one) => one.what),
    ['itemNamed'],
  )
  assert.deepEqual(await asked(''), [])
  assert.deepEqual(
    (await asked('&above=1')).map((one) => one.what),
    ['itemNamed'],
  )
})

/** An element of the page by the `id` that its view gives it. */
const byId = (page: Page, id: string) => page.locator(`[id="${id}"]`)

/** Waits until the page shows the screen of a heading, at an address. */
async function shows(page: Page, heading: string, path: string): Promise<void> {
  await page.waitForFunction((wanted) => document.querySelector('h1')?.textContent === wanted, heading)
  assert.equal(new URL(page.url()).pathname, path)
}

for (const engine of browserEngines) {
  test(`[32-5] a move fetches the next screen in one request and loads no document, a component that both screens sit inside keeps its state, the title follows, and going back shows the screen before, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/things`)
      // The component around the screen has a state of its own, which a move must keep.
      await byId(page, 'press').click()
      await byId(page, 'press').click()
      assert.equal(await byId(page, 'press').textContent(), 'Pressed 2')
      // The page marks itself, so that a document that is loaded anew is seen.
      await page.evaluate(() => document.body.setAttribute('data-first', ''))
      const asked: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        asked.push(request.isNavigationRequest() ? `document ${url.pathname}` : url.pathname)
      })
      await byId(page, 'open').first().click()
      await shows(page, 'Saw', '/things/Saw')
      assert.equal(await byId(page, 'kind').textContent(), 'tool')
      // One request for the screen, and the files of the next screen: no document, and nothing of the page code.
      assert.equal(asked.filter((one) => one === '/_t/screen').length, 1)
      assert.deepEqual(
        asked.filter((one) => one.startsWith('document')),
        [],
      )
      assert.ok(
        asked.every((one) => one === '/_t/screen' || /^\/_t\/(b\/browser\/(?!page\.)|live)/.test(one)),
        asked.join(' '),
      )
      assert.equal(await page.evaluate(() => document.body.hasAttribute('data-first')), true)
      // The component that both screens sit inside kept its state, and is told the screen it wraps now.
      assert.equal(await byId(page, 'press').textContent(), 'Pressed 2')
      assert.equal(await byId(page, 'wraps').textContent(), 'thingScreen')
      // The title is worked out from the screen and its answers, and the focus is on the heading of the new screen.
      assert.equal(await page.title(), 'About Saw')
      // The page moves the focus after it draws the screen, so the test waits for it as it waits for the heading.
      await page.waitForFunction(() => document.activeElement?.tagName === 'H1')
      // A link marks itself: the one whose address is shown is current, and one above it too, unless it says `exact`.
      assert.equal(await byId(page, 'toSaw').getAttribute('aria-current'), 'page')
      assert.equal(await byId(page, 'toTools').getAttribute('aria-current'), 'page')
      // Going back shows the screen before, and forward the one after.
      await page.goBack()
      await shows(page, 'Things', '/things')
      assert.equal(await page.title(), 'Things')
      assert.equal(await byId(page, 'toSaw').getAttribute('aria-current'), null)
      assert.equal(await byId(page, 'press').textContent(), 'Pressed 2')
      await page.goForward()
      await shows(page, 'Saw', '/things/Saw')
      assert.equal(await page.evaluate(() => document.body.hasAttribute('data-first')), true)
      assert.deepEqual(said, [])
    })
  })

  test(`[32-5] after a move the page is at its top, a move to a place on the screen scrolls to that element and the address gains it, and a link that is opened in a new tab is left to the browser, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/things`)
      // A link far down the page: the page that it goes to is shown from its top.
      await byId(page, 'low').scrollIntoViewIfNeeded()
      assert.ok((await page.evaluate(() => scrollY)) > 500)
      await byId(page, 'low').click()
      await shows(page, 'Drill', '/things/Drill')
      await page.waitForFunction(() => scrollY === 0)
      // A move to a place scrolls its element into view, gives it the focus, and writes it into the address.
      await byId(page, 'toPrice').click()
      await page.waitForFunction(() => location.hash === '#price')
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'price')
      const top = await byId(page, 'price').evaluate((element) => element.getBoundingClientRect().top)
      assert.ok(top >= 0 && top < 600, String(top))
      // A press with the key that opens a new tab is the browser's own: the page stays where it is.
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
      await byId(page, 'back').click({ modifiers: [modifier] })
      await page.waitForTimeout(300)
      assert.equal(new URL(page.url()).pathname, '/things/Drill')
      assert.deepEqual(said, [])
    })
  })

  test(`[32-6] pointing at a link to a screen asks for its screen once, and the move that follows asks nothing more, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/things`)
      const asked: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname === '/_t/screen') asked.push(url.search)
      })
      await byId(page, 'open').first().hover()
      await page.waitForFunction(() =>
        performance.getEntriesByType('resource').some((one) => one.name.includes('prefetch=1')),
      )
      await page.waitForTimeout(300)
      assert.equal(asked.length, 1)
      assert.match(asked[0], /prefetch=1/)
      await byId(page, 'open').first().click()
      await shows(page, 'Saw', '/things/Saw')
      assert.equal(asked.length, 1)
      assert.deepEqual(said, [])
    })
  })

  test(`[32-6] with prefetch 'view' a link asks for its screen when it comes into view, and not when the page shows it far down, in ${engine}`, async () => {
    const { address } = await limitedShop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const asked: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname === '/_t/screen') asked.push(url.searchParams.get('path') ?? '')
      })
      await alive(page, `${address}/far`)
      await page.waitForTimeout(500)
      assert.deepEqual(asked, [])
      await byId(page, 'seen').scrollIntoViewIfNeeded()
      await page.waitForFunction(() =>
        performance
          .getEntriesByType('resource')
          .some((one) => one.name.includes('Kite') && one.name.includes('prefetch=1')),
      )
      assert.deepEqual(asked, ['/things/Kite'])
      assert.deepEqual(said, [])
    })
  })

  test(`[32-6] what was prefetched is kept as long as prefetchKept says: after it, the move asks for its screen once more, in ${engine}`, async () => {
    const { address } = await limitedShop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/far`)
      const asked: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname === '/_t/screen') asked.push(url.search)
      })
      await byId(page, 'near').hover()
      await page.waitForFunction(() =>
        performance
          .getEntriesByType('resource')
          .some((one) => one.name.includes('Saw') && one.name.includes('prefetch=1')),
      )
      // Longer than the 300 ms the project keeps it.
      await page.waitForTimeout(800)
      await byId(page, 'near').click()
      await shows(page, 'Saw', '/things/Saw')
      // The press hovers the link once more, and so prefetches it again: either way it is asked anew.
      assert.equal(asked.length, 2, asked.join(' '))
      assert.deepEqual(said, [])
    })
  })

  test(`[32-5] a move with above draws the screen in a dialog with its own address, over the screen underneath, which stays; Escape and the back button close it, and the address loaded whole is that screen alone, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/things`)
      await byId(page, 'press').click()
      await byId(page, 'peek').click()
      const dialog = page.locator('dialog[aria-modal="true"]')
      await dialog.waitFor()
      await page.waitForFunction(() => document.querySelector('dialog h1')?.textContent === 'Kite')
      assert.equal(new URL(page.url()).pathname, '/things/Kite')
      // The screen underneath stays as it is, under the browser's own dialog, which is named by its title.
      assert.equal(await page.locator('[id="things"] h1').textContent(), 'Things')
      assert.equal(await byId(page, 'press').textContent(), 'Pressed 1')
      assert.equal(await dialog.evaluate((element) => element.matches(':modal')), true)
      assert.equal(await dialog.getAttribute('aria-label'), 'About Kite')
      assert.equal(await dialog.locator('[id="kind"]').textContent(), 'toy')
      // The components that the screen above sits inside are not drawn in it.
      assert.equal(await dialog.locator('nav').count(), 0)
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      await page.waitForFunction(() => location.pathname === '/things')
      // The back button closes it too.
      await byId(page, 'peek').click()
      await dialog.waitFor()
      await page.goBack()
      await dialog.waitFor({ state: 'detached' })
      assert.equal(new URL(page.url()).pathname, '/things')
      assert.equal(await byId(page, 'press').textContent(), 'Pressed 1')
      // The same address loaded whole is that screen as a page, with nothing underneath.
      await alive(page, `${address}/things/Kite`)
      assert.equal(await page.locator('dialog').count(), 0)
      assert.equal(await page.locator('h1').textContent(), 'Kite')
      assert.deepEqual(said, [])
    })
  })

  test(`[32-5] a screen above draws what its view reads above, and writes its own state into its address, in ${engine}`, async () => {
    const { address } = await peeks()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/peeks`)
      await byId(page, 'toPeek').click()
      const dialog = page.locator('dialog[aria-modal="true"]')
      await dialog.waitFor()
      await page.waitForFunction(() => document.querySelector('dialog [id="kind"]')?.textContent === 'toy')
      await dialog.locator('[id="side"]').click()
      await page.waitForFunction(() => document.querySelector('dialog [id="side"]')?.textContent === 'back')
      await page.waitForFunction(() => location.pathname === '/peek/Kite' && location.search === '?side=back')
      assert.deepEqual(said, [])
    })
  })
}
