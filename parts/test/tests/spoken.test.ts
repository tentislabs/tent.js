import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// The project of the languages is built and served once for the tests of this file that write no row.
let common: Promise<Served> | undefined
const shop = (): Promise<Served> => {
  common ??= served('spoken')
  return common
}

/** The text of the element of a page by its `id`, in a whole document. */
function textOf(html: string, id: string): string {
  const found = new RegExp(`id="${id}"[^>]*>(.*?)</`, 's').exec(html)
  return (found?.[1] ?? '').replace(/<[^>]*>/g, '')
}

/** The texts of every element of a page that carries a class, in a whole document, as a browser reads them. */
function textsOf(html: string, name: string): string {
  return [...html.matchAll(new RegExp(`class="${name}"[^>]*>(.*?)</`, 'gs'))]
    .map((one) => one[1].replace(/<[^>]*>/g, '').replaceAll('&amp;', '&'))
    .join('|')
}

/** The record of the page that a document holds. */
function recordOf(html: string): Record<string, unknown> {
  const found = /<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)
  return Object(JSON.parse(found?.[1] ?? '{}'))
}

test('[32-9] /tr/orders draws the Turkish words and /orders the English: a plural takes the form of its count, a missing key shows the word of the default language, a word labels an entry of options, and a word whose key is built from a choice shows the word of each value', async () => {
  const { app } = await shop()
  const en = await app.page('/orders')
  const tr = await app.page('/tr/orders')
  assert.deepEqual([en.status, tr.status], [200, 200])
  assert.match(en.html, /<html lang="en"/)
  assert.match(tr.html, /<html lang="tr"/)
  assert.match(en.html, /<title>Open orders<\/title>/)
  assert.match(tr.html, /<title>Açık siparişler<\/title>/)
  assert.deepEqual(
    ['count', 'none', 'one', 'only'].map((id) => textOf(en.html, id)),
    ['2 orders', 'No orders', '1 order', 'Only in English'],
  )
  // Turkish gives no form for zero, and a key it lacks is shown in the default language.
  assert.deepEqual(
    ['count', 'none', 'one', 'only'].map((id) => textOf(tr.html, id)),
    ['2 sipariş', '0 sipariş', '1 sipariş', 'Only in English'],
  )
  // Each row shows the word of its status, and the entry of a select its word.
  assert.equal(textsOf(en.html, 'status'), 'Paid|Open')
  assert.equal(textsOf(tr.html, 'status'), 'Ödendi|Açık')
  assert.match(en.html, /<select id="picked" name="picked"><option value="open">Open<\/option>/)
  assert.match(tr.html, /<select id="picked" name="picked"><option value="open">Açık<\/option>/)
  // The page holds its language and the address without its code; a link names the address in it.
  const record = recordOf(tr.html)
  assert.deepEqual([record.language, record.path, record.languages], ['tr', '/orders', ['en', 'tr', 'ar']])
  assert.match(tr.html, /<a [^>]*id="home"[^>]*href="\/tr"|<a [^>]*href="\/tr"[^>]*id="home"/)
  assert.match(tr.html, /<a [^>]*id="toEnglish"[^>]*href="\/orders"|<a [^>]*href="\/orders"[^>]*id="toEnglish"/)
  // A view reads its words through the hook.
  const home = await app.page('/tr')
  assert.match(home.html, /<h1[^>]*>Merhaba Ada<\/h1>/)
  assert.match(home.html, /tr of en tr ar/)
  // The default language has no code in its addresses, and a language that is none is not found.
  // The code of the default language answers 308 to the address without it.
  const coded = await app.page('/en/orders?tab=2')
  assert.deepEqual([coded.status, coded.headers.location], [308, '/orders?tab=2'])
  const root = await app.page('/en')
  assert.deepEqual([root.status, root.headers.location], [308, '/'])
  assert.equal((await app.page('/de/orders')).status, 404)
})

test('[32-9] a message among the children of an element is drawn in the language of the page: alone, in a list, and inside a Link, in the first HTML and once the page lives', async () => {
  const { app, address } = await shop()
  const en = await app.page('/written')
  const tr = await app.page('/tr/written')
  assert.deepEqual([en.status, tr.status], [200, 200])
  assert.deepEqual(
    ['said', 'listed', 'linked'].map((id) => textOf(en.html, id)),
    ['Hello Ada', 'Open / Paid', 'Open orders'],
  )
  assert.deepEqual(
    ['said', 'listed', 'linked'].map((id) => textOf(tr.html, id)),
    ['Merhaba Ada', 'Açık / Ödendi', 'Açık siparişler'],
  )
  await inBrowser('chromium', async (page) => {
    const said = complaintsOf(page)
    await alive(page, `${address}/tr/written`)
    assert.deepEqual(await shown(page, ['said', 'listed', 'linked'], []), [
      'Merhaba Ada',
      'Açık / Ödendi',
      'Açık siparişler',
    ])
    assert.deepEqual(said, [])
  })
})

test('[32-2] with no script a form keeps the language of its page: a then that moves goes to the address in that language, and a then that sets a state goes back to the screen with that state in its address', async () => {
  const { app, address } = await shop()
  const version = String(recordOf((await app.page('/tr/contact')).html).version)
  const sent = async (form: string, at: string): Promise<[number, string | null]> => {
    const answer = await fetch(`${address}/_t/form/addOrder`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        name: `Sent by ${form}`,
        status: 'open',
        total: '1',
        't-at': at,
        't-form': form,
        't-version': version,
      }),
      redirect: 'manual',
    })
    return [answer.status, answer.headers.get('location')]
  }
  assert.deepEqual(await sent('moved', '/tr/contact'), [303, '/tr/orders'])
  assert.deepEqual(await sent('set', '/tr/contact'), [303, '/tr/contact?sent=true'])
  assert.deepEqual(await sent('moved', '/contact'), [303, '/orders'])
  assert.deepEqual(await sent('set', '/contact'), [303, '/contact?sent=true'])
  assert.match((await app.page('/tr/contact?sent=true')).html, /<p id="sent">sent<\/p>/)
})

test('[32-10] a page of each language names itself as its one address, and the same screen in every language, itself among them, with the default language as x-default', async () => {
  const { app } = await shop()
  const lines = async (path: string): Promise<string[]> =>
    [...(await app.page(path)).html.matchAll(/<link rel="(?:canonical|alternate)"[^>]*>/g)].map((one) => one[0])
  // Search engines read the versions of a page as one set where each lists all of them, itself too.
  const set = (path: string): string[] => [
    `<link rel="alternate" hreflang="en" href="http://localhost${path || '/'}">`,
    `<link rel="alternate" hreflang="tr" href="http://localhost/tr${path}">`,
    `<link rel="alternate" hreflang="ar" href="http://localhost/ar${path}">`,
    `<link rel="alternate" hreflang="x-default" href="http://localhost${path || '/'}">`,
  ]
  assert.deepEqual(await lines('/orders'), ['<link rel="canonical" href="http://localhost/orders">', ...set('/orders')])
  assert.deepEqual(await lines('/tr/orders'), [
    '<link rel="canonical" href="http://localhost/tr/orders">',
    ...set('/orders'),
  ])
  assert.deepEqual(await lines('/tr'), ['<link rel="canonical" href="http://localhost/tr">', ...set('')])
})

test('[32-10] [32-13] the sitemap names each address in each language, a page names its address in each other language, and an export writes each language under its code', async () => {
  const { app, address, dataFolder } = await shop()
  const sitemap = await (await fetch(`${address}/sitemap.xml`)).text()
  for (const path of ['/orders', '/tr/orders', '/ar/orders', '/tr'])
    assert.match(sitemap, new RegExp(`<loc>${address}${path}</loc>`))
  const page = (await app.page('/tr/orders')).html
  // A program that asks for a page reaches the app as this computer: the address is written with that name.
  assert.match(page, /<link rel="alternate" hreflang="ar" href="http:\/\/localhost\/ar\/orders">/)
  const folder = join(dataFolder, 'site')
  await app.export(folder)
  assert.match(readFileSync(join(folder, 'tr', 'orders', 'index.html'), 'utf8'), /<h1[^>]*>Açık siparişler<\/h1>/)
  assert.match(readFileSync(join(folder, 'ar', 'orders', 'index.html'), 'utf8'), /<html lang="ar" dir="rtl"/)
  assert.ok(existsSync(join(folder, '_t', 's', 'tr', 'orders.json')))
})

test('[32-7] an address with a language code is not found where it would lead to another site', async () => {
  const { app } = await shop()
  for (const path of ['/en//evil.example', '/tr//evil.example', '/tr/%2F%2Fevil.example', '//evil.example/'])
    assert.equal((await app.page(path)).status, 404, path)
})

test("[32-3] the words of a failed check are shown in the language of the page, under a field that useField drives and in the browser's own validity of a native one, in English where it gives none", async () => {
  const { address } = await shop()
  await inBrowser('chromium', async (page) => {
    for (const [path, words] of [
      ['/add', 'This is needed.'],
      ['/tr/add', 'Bu gerekli.'],
    ]) {
      await alive(page, `${address}${path}`)
      await page.locator('#send').click()
      await page.locator('#name').getByText(words).waitFor()
      // A native control is told the same words by the browser's own validity.
      const told = await page
        .locator('#total')
        .evaluate((element) => (element instanceof HTMLInputElement ? element.validationMessage : ''))
      assert.equal(told, words)
    }
  })
})

/** The texts of the elements that carry the ids and the classes, as the page shows them. */
const shown = (page: Page, ids: string[], names: string[]): Promise<string[]> =>
  page.evaluate(
    ([wanted, classes]) => [
      ...wanted.map((id) => document.getElementById(id)?.textContent ?? ''),
      ...classes.map((name) =>
        [...document.getElementsByClassName(name)].map((one) => one.textContent ?? '').join('|'),
      ),
    ],
    [ids, names],
  )

for (const engine of browserEngines) {
  test(`[32-9] [30-5] in the browser the words and the values of each format are those of the first HTML, in two languages; a Link keeps the language, and a Link with a language alone goes to the page in it and is current while the page is in it, in ${engine}`, async () => {
    const { address, app } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      for (const path of ['/orders', '/tr/orders']) {
        const first = (await app.page(path)).html
        await alive(page, `${address}${path}`)
        const ids = ['count', 'none', 'only']
        const names = ['status', 'money', 'share']
        const was = [...ids.map((id) => textOf(first, id)), ...names.map((name) => textsOf(first, name))]
        assert.deepEqual(await shown(page, ids, names), was, path)
      }
      // On the Turkish page the link that names Turkish alone is current, and the one that names English is not.
      assert.equal(await page.locator('#toTurkish').getAttribute('aria-current'), 'page')
      assert.equal(await page.locator('#toEnglish').getAttribute('aria-current'), null)
      await page.locator('#home').click()
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Merhaba Ada')
      assert.equal(new URL(page.url()).pathname, '/tr')
      await page.locator('#orders').click()
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Açık siparişler')
      assert.equal(new URL(page.url()).pathname, '/tr/orders')
      await page.locator('#toEnglish').click()
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Open orders')
      assert.equal(new URL(page.url()).pathname, '/orders')
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'en')
      await page.locator('#ordersInTurkish').click()
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Açık siparişler')
      assert.equal(new URL(page.url()).pathname, '/tr/orders')
      assert.deepEqual(said, [])
    })
  })
}

test("[30-5] a first visit shows times in the zone of the project and then in the viewer's own, which the page keeps in tent_zone, and a value shown as relative is written when the view is drawn", async () => {
  const { address } = await shop()
  await inBrowser('chromium', async (page) => {
    const said = complaintsOf(page)
    await page.clock.install({ time: new Date('2026-01-15T10:05:00.000Z') })
    const first = await (await fetch(`${address}/times`)).text()
    // The first HTML of a first visit has no cookie of the zone: it shows the time in the zone of the project.
    assert.match(first, /<p id="at">Jan 15, 2026, 10:30\sPM</)
    await alive(page, `${address}/times`)
    const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    const own = await page.evaluate(() =>
      new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date('2026-01-15T22:30:00.000Z')),
    )
    await page.waitForFunction((wanted) => document.querySelector('#at')?.textContent === wanted, own)
    const cookies = await page.context().cookies()
    assert.deepEqual(
      cookies.filter((one) => one.name === 'tent_zone').map((one) => decodeURIComponent(one.value)),
      [zone],
    )
    // A visit that sends the cookie is drawn in the viewer's zone from the first HTML on.
    const again = await (
      await fetch(`${address}/times`, { headers: { cookie: `tent_zone=${encodeURIComponent(zone)}` } })
    ).text()
    assert.ok(again.replace(/\s/g, ' ').includes(`>${own.replace(/\s/g, ' ')}<`), own)
    assert.equal(await page.locator('#ago').textContent(), '5 minutes ago')
    assert.deepEqual(said, [])
  })
})
