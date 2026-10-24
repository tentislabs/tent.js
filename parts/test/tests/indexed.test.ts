import assert from 'node:assert/strict'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// The project of the search engines is built and served once for the tests of this file: none of them writes a row.
let common: Promise<Served> | undefined
const shop = (): Promise<Served> => {
  common ??= served('indexed')
  return common
}

/** The head of the first HTML of an address. */
async function headOf(address: string, path: string): Promise<string> {
  const html = await (await fetch(`${address}${path}`)).text()
  return /<head>([\s\S]*)<\/head>/.exec(html)?.[1] ?? ''
}

test('[32-10] a screen whose title and description are arrows over its data has the values of its row in its first HTML, and its head names its one address, its picture and its structured data', async () => {
  const { address } = await shop()
  const head = await headOf(address, '/products/chair')
  assert.match(head, /<title>The chair<\/title>/)
  assert.match(head, /<meta name="description" content="A chair to sit on">/)
  assert.match(head, new RegExp(`<link rel="canonical" href="${address}/products/chair">`))
  assert.match(
    head,
    new RegExp(`<meta property="og:image" content="${address}/_t/b/assets/icon\\.[0-9a-f]{12}\\.svg">`),
  )
  const data = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head)?.[1] ?? ''
  assert.deepEqual(JSON.parse(data), { '@type': 'Product', name: 'The chair' })
  // A text of a row is written as text: it can end no script of the head and add no element.
  const lamp = await headOf(address, '/products/lamp')
  assert.match(lamp, /<title>Lamp &lt;\/script&gt;&lt;b&gt;bold&lt;\/b&gt;<\/title>/)
  assert.match(lamp, /<meta name="description" content="A lamp &amp; &quot;more&quot; &lt;x&gt;">/)
  const lampData = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(lamp)?.[1] ?? ''
  assert.ok(!lampData.includes('</script>') && !lampData.includes('<b>'), lampData)
  assert.equal(JSON.parse(lampData).name, 'Lamp </script><b>bold</b>')
  // A screen that says index: false tells search engines to leave it out.
  assert.match(await headOf(address, '/hidden'), /<meta name="robots" content="noindex">/)
  assert.ok(!(await headOf(address, '/')).includes('noindex'))
})

test('[32-10] the sitemap lists each public screen, a screen with values once for each row of seo.addresses, and leaves out one with index: false, one that needs a sign-in and one with values and no addresses; in the mode test robots.txt lets nothing be read', async () => {
  const { address } = await shop()
  const answered = await fetch(`${address}/sitemap.xml`)
  assert.equal(answered.status, 200)
  assert.match(answered.headers.get('content-type') ?? '', /^application\/xml/)
  const map = await answered.text()
  assert.match(
    map,
    /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
  )
  const listed = [...map.matchAll(/<loc>([^<]*)<\/loc>/g)].map((found) => found[1])
  assert.deepEqual(listed, [`${address}/`, `${address}/products/chair`, `${address}/products/lamp`])
  // What robots.txt says in the modes development and test: nothing may be read.
  const robots = await (await fetch(`${address}/robots.txt`)).text()
  assert.match(robots, /^User-agent: \*\nDisallow: \//)
  assert.match(robots, new RegExp(`Sitemap: ${address}/sitemap\\.xml`))
})

test('[32-14] a meta line of the project is in every page and one of a screen only in that screen, a script of the head is an asset or comes from a host that unlock lists, and the icon is served', async () => {
  const { address } = await shop()
  const home = await headOf(address, '/')
  const product = await headOf(address, '/products/chair')
  for (const head of [home, product]) {
    assert.match(head, /<meta name="theme-color" content="#123456">/)
    assert.match(head, /<link rel="preconnect" href="https:\/\/widgets\.example\.com">/)
    assert.match(head, /<link rel="icon" href="\/_t\/b\/assets\/icon\.[0-9a-f]{12}\.svg">/)
  }
  assert.match(product, /<meta property="og:type" content="product">/)
  assert.ok(!home.includes('og:type'))
  // A script of the head carries the nonce of the page, which a library's script before the first paint needs.
  assert.match(product, /<script src="\/_t\/b\/assets\/widget\.[0-9a-f]{12}\.js" async nonce="[\w-]+"><\/script>/)
  const icon = /<link rel="icon" href="([^"]+)">/.exec(home)?.[1] ?? ''
  const served = await fetch(`${address}${icon}`)
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('content-type'), 'image/svg+xml')
})

for (const engine of browserEngines)
  test(`[32-10] the title of the browser follows a move to a screen whose title is an arrow over its data, and a script of the head runs, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/products/chair`)
      await page.waitForFunction(() => document.body.dataset.widget === '1')
      await alive(page, `${address}/`)
      assert.equal(await page.title(), 'The shop')
      await page.locator('[id="open"]').first().click()
      await page.waitForFunction(() => document.title === 'The chair')
      assert.deepEqual(said, [])
    })
  })
