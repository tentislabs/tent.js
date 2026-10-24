import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, served } from './served.ts'

// The project of the addresses is built and served once for the tests of this file that leave it as it is.
let common: Promise<Served> | undefined
const shop = (): Promise<Served> => {
  common ??= served('addressed')
  return common
}

/** What the app answers an address with, as a browser that does not follow a move is answered. */
async function answer(
  address: string,
  path: string,
): Promise<{ status: number; location: string | null; html: string }> {
  const got = await fetch(`${address}${path}`, { redirect: 'manual' })
  return { status: got.status, location: got.headers.get('location'), html: await got.text() }
}

const heading = (html: string): string =>
  /<h1[^>]*>([^<]*(?:<!-- -->[^<]*)*)<\/h1>/.exec(html)?.[1]?.replaceAll('<!-- -->', '') ?? ''

test('[32-7] each address goes where the table of addresses says: a screen by its pattern, the more exact one first, the rest of a pattern, and an unknown address to the notFound screen of the project', async () => {
  const { address } = await shop()
  assert.equal(heading((await answer(address, '/')).html), 'Home')
  assert.equal(heading((await answer(address, '/orders/42')).html), 'Order 42')
  // A fixed part wins over a value.
  assert.equal(heading((await answer(address, '/orders/new')).html), 'A new order')
  assert.equal(heading((await answer(address, '/docs/start/install')).html), 'Docs start/install')
  // A screen at the bare address of a rest wins over the rest, which there would take nothing.
  assert.equal(heading((await answer(address, '/docs')).html), 'The index of the docs')
  assert.equal(heading((await answer(address, '/docs/start')).html), 'Docs start')
  // An address that ends in a slash answers 308 to the one without it.
  assert.deepEqual(await answer(address, '/orders/42/'), { status: 308, location: '/orders/42', html: '' })
  const lost = await answer(address, '/nothing/here')
  assert.equal(lost.status, 404)
  assert.equal(heading(lost.html), 'Nothing is here')
})

test('[32-7] a redirect answers 308 with the values of from in to, 307 where it says permanent: false, and may lead to an outside address', async () => {
  const { address } = await shop()
  assert.deepEqual(await answer(address, '/old/7'), { status: 308, location: '/orders/7', html: '' })
  assert.deepEqual(await answer(address, '/manual/start/install'), {
    status: 307,
    location: '/docs/start/install',
    html: '',
  })
  assert.deepEqual(await answer(address, '/away'), {
    status: 308,
    location: 'https://help.example.com/start',
    html: '',
  })
  // What stands after the question mark goes with it.
  assert.equal((await answer(address, '/old/7?tab=paid')).location, '/orders/7?tab=paid')
  // A value is written with its percent signs, so that no value of an address can make another address of it.
  assert.equal((await answer(address, '/old/a%2F..%2F..%2Fx')).location, '/orders/a%2F..%2F..%2Fx')
})

test('[32-7] //evil.example/ and /en//evil.example, as written and with percent signs, are not found, and no answer of the engine leads to another site', async () => {
  const { address } = await shop()
  for (const path of [
    '//evil.example/',
    '/en//evil.example',
    '/%2F%2Fevil.example/',
    '/%5Cevil.example',
    '/en/%2Fevil.example',
  ]) {
    const got = await answer(address, path)
    assert.deepEqual([got.status, got.location], [404, null], path)
  }
  // A value of a redirect that reads as the address of another site makes no address of the app at all.
  const away = await answer(address, '/old/%2F%2Fevil.example')
  assert.deepEqual([away.status, away.location], [404, null])
})

test("[31-4] a view that fails is drawn with the project's own error screen, with the status of the error, and a project's own notFound screen with 404", async () => {
  const { address } = await shop()
  const broke = await answer(address, '/breaks')
  assert.equal(broke.status, 500)
  assert.equal(heading(broke.html), 'Our own error page')
  assert.match(broke.html, /<span[^>]*>T0009<\/span>/)
  // The page record names the screen that is shown, and the page loads its module.
  const record = JSON.parse(
    /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(broke.html)?.[1] ?? '{}',
  )
  assert.equal(record.screen, 'brokeScreen')
  assert.match(record.load.screen, /^browser\/.*\.js$/)
})

test('[31-4] where the error screen of the project fails too, the built-in one is drawn', async () => {
  const { address } = await served('addressed', {
    change: (folder) => {
      const file = join(folder, 'screens.tsx')
      writeFileSync(file, readFileSync(file, 'utf8').replace("{error ? error.code : 'none'}", '{error.missing.code}'))
    },
  })
  const broke = await answer(address, '/breaks')
  assert.equal(broke.status, 500)
  assert.equal(heading(broke.html), '500')
  assert.match(broke.html, /<h2[^>]*>Something went wrong\.<\/h2>/)
  const record = JSON.parse(
    /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(broke.html)?.[1] ?? '{}',
  )
  assert.equal(record.screen, 'tent.error')
})

test("[32-7] with trailingSlash: 'keep' an address with no slash at its end answers 308 to the one with it, and /_t/health is as it was", async () => {
  const { address } = await served('addressed', {
    change: (folder) => {
      const file = join(folder, 'tent.ts')
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace("title: 'Shop',", "title: 'Shop',\n  trailingSlash: 'keep',"),
      )
    },
  })
  assert.deepEqual(await answer(address, '/orders/42'), { status: 308, location: '/orders/42/', html: '' })
  const kept = await answer(address, '/orders/42/')
  assert.equal(kept.status, 200)
  assert.equal(heading(kept.html), 'Order 42')
  // The page record holds the address without its slash.
  const record = JSON.parse(
    /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(kept.html)?.[1] ?? '{}',
  )
  assert.equal(record.path, '/orders/42')
  assert.equal(heading((await answer(address, '/')).html), 'Home')
  assert.equal((await answer(address, '/old/7/')).location, '/orders/7/')
  assert.equal((await fetch(`${address}/_t/health`)).status, 200)
})

/** A screen with links, written into a copy of the project of addresses. */
const linked = `import { screen, Link } from 'tentjs/ui'

export const linkedScreen = screen('linkedScreen', {
  path: '/linked',
  access: 'anyone',
  title: 'Linked',
  view: () => (
    <main style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <h1>Linked</h1>
      <Link to="/orders/42" id="toOrder">The order</Link>
      <Link to="/docs/start?part=2" id="toDocs">The docs</Link>
    </main>
  ),
})
`

test("[32-7] with trailingSlash: 'keep' every address that the engine and the page write for a screen ends in a slash: a goTo, the sitemap and the one address in the head, and a move in the browser", async () => {
  const { address, app } = await served('addressed', {
    change: (folder) => {
      const file = join(folder, 'tent.ts')
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace("title: 'Shop',", "title: 'Shop',\n  trailingSlash: 'keep',"),
      )
      writeFileSync(join(folder, 'linked.tsx'), linked)
    },
  })
  const page = (await app.page('/linked/')).html
  assert.match(page, /id="toOrder"[^>]*href="\/orders\/42\/"|href="\/orders\/42\/"[^>]*id="toOrder"/)
  assert.match(page, /href="\/docs\/start\/\?part=2"/)
  assert.match(page, /<link rel="canonical" href="http:\/\/localhost\/linked\/">/)
  const sitemap = await (await fetch(`${address}/sitemap.xml`)).text()
  assert.match(sitemap, new RegExp(`<loc>${address}/linked/</loc>`))
  await inBrowser('chromium', async (browser) => {
    await alive(browser, `${address}/linked/`)
    await browser.locator('[id="toOrder"]').click()
    await browser.waitForFunction(() => document.querySelector('h1')?.textContent === 'Order 42')
    assert.equal(new URL(browser.url()).pathname, '/orders/42/')
  })
})

/** A route that states GET, and one that states POST, written into a copy of the project of addresses. */
const routed = `import { route } from 'tentjs'

export const feed = route('feed', {
  method: 'GET',
  path: '/feed.xml',
  access: 'anyone',
  run: () => new Response('<feed />'),
})

export const hook = route('hook', {
  method: 'POST',
  path: '/hook',
  access: 'anyone',
  run: () => new Response('ok'),
})
`

test('[32-7] /_t/screen answers { leave } for a route that states GET, the sitemap, robots.txt and /mcp, with what stands after the question mark, so that a link can lead to one', async () => {
  const { address } = await served('addressed', {
    change: (folder) => writeFileSync(join(folder, 'routed.ts'), routed),
  })
  // Asked with no version, the running one answers.
  const again = async (path: string): Promise<unknown> =>
    Object(await (await fetch(`${address}/_t/screen?path=${encodeURIComponent(path)}`)).json()).value
  for (const path of ['/feed.xml?page=2', '/sitemap.xml', '/robots.txt', '/mcp'])
    assert.deepEqual(await again(path), { leave: path }, path)
  // A route that states no GET is no address a link leads to: it is drawn as any other address.
  assert.equal(Object(await again('/hook')).screen, 'lostScreen')
})
