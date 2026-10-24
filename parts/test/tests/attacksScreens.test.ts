import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Served } from './served.ts'
import { served } from './served.ts'

// Each project is built and served once for the tests of this file that write no row.
const held = new Map<string, Promise<Served>>()
const shop = (name: string): Promise<Served> => {
  const one = held.get(name) ?? served(name)
  held.set(name, one)
  return one
}

/** The record of the page that a document holds, as its text, and the drawing. */
function partsOf(html: string): { record: string; drawing: string } {
  const record = /<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)?.[1] ?? ''
  const drawing = /<div id="tent">(.*)<\/div>\n<script type="application\/json" id="tent-page">/s.exec(html)?.[1] ?? ''
  return { record, drawing }
}

/** Whether an answer leads to a path of the app: no other site, by any way a browser reads an address. */
const ofTheApp = (location: string): boolean =>
  location.startsWith('/') && !location.startsWith('//') && !location.includes('\\') && !/[\t\n\r]/.test(location)

test('[05-4.1@7c] a row whose text holds </script>, <!--, a line separator and an HTML tag is shown as written in the structured data, and no element is made of it', async () => {
  const { app } = await shop('indexed')
  const name = `</script><!--\u2028<b>bold</b>`
  await app.write([{ add: 'products', values: { slug: 'bad', name, summary: 'A row' } }], { as: 'system' })
  const html = (await app.page('/products/bad')).html
  const data = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1] ?? ''
  assert.ok(data.length > 0, 'the page holds its structured data')
  assert.ok(!/<\/script|<!--|<b>|\u2028/.test(data), data)
  assert.deepEqual(Object(JSON.parse(data)).name, name)
  const { record, drawing } = partsOf(html)
  assert.ok(!/<\/script|<!--|<b>|\u2028/.test(record))
  assert.ok(!drawing.includes('<b>'), drawing)
  assert.match(drawing, /&lt;\/script&gt;&lt;!--/)
})

test('[05-4.4] the answers of the engine that send a visitor on, to an address with a slash at its end and to one with the code of the default language, lead to a path of the app', async () => {
  const { address } = await shop('spoken')
  for (const path of [
    '//evil.example/',
    '/%2F%2Fevil.example/',
    '/en//evil.example',
    '/en/%2F%2Fevil.example/',
    '/tr//evil.example/',
    '/tr/%2F%2Fevil.example/',
    '/%5Cevil.example/',
  ]) {
    const answer = await fetch(`${address}${path}`, { redirect: 'manual' })
    const location = answer.headers.get('location')
    if (location === null) assert.equal(answer.status, 404, path)
    else assert.ok(ofTheApp(location), `${path} leads to ${location}`)
  }
})

test('[05-4.5] a Link and then of a form whose address is javascript in capitals, with room and with a line break, data or vbscript draw no link', async () => {
  const { app } = await shop('attacked')
  const { drawing } = partsOf((await app.page('/links')).html)
  assert.ok(!/href="\s*(java|data|vb)/i.test(drawing), drawing)
  assert.equal((drawing.match(/href=/g) ?? []).length, 1)
  assert.match(drawing, /href="https:\/\/example\.com\/help"/)
})

test('[05-4.11] a public screen with a cache, asked first by one visitor and then by another: nothing of the first is sent to the second', async () => {
  const { address } = await shop('cached')
  const cookie = `tent_state.shop=${Buffer.from(JSON.stringify({ dark: true })).toString('base64url')}`
  const first = await fetch(`${address}/shared`, { headers: { cookie } })
  assert.match(await first.text(), /"dark":true/)
  const second = await (await fetch(`${address}/shared`)).text()
  assert.doesNotMatch(second, /"dark":true/)
})

test('[05-4.16] a value of state in the address and in the tent_state cookie that holds </script> and a quote is read against its type, and drawn as text', async () => {
  const { address } = await shop('stated')
  const bad = '</script>"<b>'
  const cookie = `tent_state.shop=${Buffer.from(JSON.stringify({ seen: bad, dark: bad })).toString('base64url')}`
  const html = await (await fetch(`${address}/desk?name=${encodeURIComponent(bad)}`, { headers: { cookie } })).text()
  const { record, drawing } = partsOf(html)
  assert.ok(!record.includes('</script'), record)
  assert.ok(!drawing.includes('<b>'), drawing)
  // A boolean of the device that is handed a text is not taken.
  assert.doesNotMatch(record, /"seen":"/)
  assert.match(record, /"name":"\\u003c\/script\\u003e\\"\\u003cb\\u003e"/)
})

/** How many times the app read a query, as its log of calls holds it, once the engine wrote what it answered. */
async function readsOf(at: Served, name: string): Promise<number> {
  await new Promise((done) => setTimeout(done, 150))
  const log = new DatabaseSync(join(at.dataFolder, 'logs.db'), { readOnly: true })
  try {
    return Number(Object(log.prepare('SELECT count(*) AS n FROM calls WHERE name = ?').get(name)).n)
  } finally {
    log.close()
  }
}

test('[05-9.1] a thousand made-up values of a text state, and a thousand names that are no state, on a cached screen leave the cache as it was', async () => {
  const at = await shop('cached')
  const text = async (path: string): Promise<string> => (await fetch(`${at.address}${path}`)).text()
  const first = await text('/news')
  // What one drawing of the screen reads.
  const before = await readsOf(at, 'allNews')
  await text('/news?search=one')
  const once = (await readsOf(at, 'allNews')) - before
  assert.ok(once > 0)
  const start = await readsOf(at, 'allNews')
  for (let k = 0; k < 1000; k++) {
    // Each made-up value is drawn each time it is asked for: none is kept. A name that is no state is the screen.
    await text(`/news?search=made${k}`)
    await text(`/news?search=made${k}`)
    await text(`/news?made${k}=1`)
  }
  assert.equal((await readsOf(at, 'allNews')) - start, 2000 * once)
  assert.equal(await text('/news'), first)
})

test('[05-9.2] a cached screen asked for by a signed-in user is sent with no-store, and the next visitor is sent nothing of it', async () => {
  // The project of the cache, with users, so that one may sign in.
  const at = await served('cached', {
    change: (folder) => {
      const file = join(folder, 'functions.ts')
      const users =
        "\nexport const users = table('users', { columns: { email: text({ unique: true }), roles: list(text()) }, access: { read: 'owner' } })\n"
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace('{ change, input, query', '{ change, input, list, query') + users,
      )
    },
  })
  const [ada] = Object(
    await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], { as: 'system' }),
  )
  const id = String(Object(ada).id)
  const cookie = at.app.session(id)
  const signed = await fetch(`${at.address}/news`, { headers: { cookie } })
  assert.equal(signed.headers.get('cache-control'), 'no-store')
  assert.ok(partsOf(await signed.text()).record.includes(`"user":{"id":"${id}"`))
  const next = partsOf(await (await fetch(`${at.address}/news`)).text()).record
  assert.match(next, /"user":null/)
  assert.ok(!next.includes(id))
})

test('[05-9.3] a value of seo.addresses that holds < is written as text in the sitemap, and one that holds ../ is skipped by an export and named', async () => {
  const at = await served('indexed')
  await at.app.write(
    [
      { add: 'products', values: { slug: 'a<b', name: 'Angled', summary: 'x' } },
      { add: 'products', values: { slug: '../up', name: 'Up', summary: 'x' } },
    ],
    { as: 'system' },
  )
  const sitemap = await (await fetch(`${at.address}/sitemap.xml`)).text()
  assert.ok(!sitemap.includes('a<b'))
  assert.match(sitemap, /a%3Cb/)
  const made = await at.app.export(join(at.dataFolder, 'site'))
  assert.ok(
    made.skipped.some((one) => one.what === '/products/..%2Fup'),
    JSON.stringify(made.skipped),
  )
})

test('[05-9.5] a head line with a name that is not listed, and a script from a host that unlock does not list, are T1014, and nothing is loaded', async () => {
  const folder = join(mkdtempSync(join(process.cwd(), 'results', 'test', 'attacked-')), 'attacked')
  cpSync(join(import.meta.dirname, 'attacked'), folder, { recursive: true })
  const file = join(folder, 'tent.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      "title: 'Shop',",
      "title: 'Shop',\n  head: [{ marquee: { text: 'x' } }, { script: { src: 'https://evil.example/a.js' } }],",
    ),
  )
  const made = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(
    made.findings.map((one) => one.code),
    ['T1014', 'T1014'],
    made.findings.map((one) => one.message).join('\n'),
  )
})

test('[05-9.11] a redirect whose to begins with a value of from, asked for with two slashes and a host, as written and with percent signs, leads to no other site', async () => {
  const { address } = await shop('attacked')
  for (const path of [
    '/go/%2F%2Fevil.example',
    '/all//evil.example',
    '/all/%2F%2Fevil.example',
    '/go/%5Cevil.example',
  ]) {
    const answer = await fetch(`${address}${path}`, { redirect: 'manual' })
    const location = answer.headers.get('location')
    if (location === null) assert.equal(answer.status, 404, path)
    else assert.ok(ofTheApp(location), `${path} leads to ${location}`)
  }
})

test('[05-9.16] a public screen that reads a state kept in the device, asked for with a tent_state cookie of an attacker, is sent with no-store', async () => {
  const { address } = await shop('cached')
  const cookie = `tent_state.shop=${Buffer.from(JSON.stringify({ dark: true })).toString('base64url')}`
  const answer = await fetch(`${address}/shared`, { headers: { cookie } })
  assert.equal(answer.headers.get('cache-control'), 'no-store')
})

/**
 * The project of the cache with an `onRequest` that adds a cookie of the visitor to every answer, and hands the
 * visitors who say they are of share b on to another address of the screen they asked for.
 */
const handing = (folder: string): void => {
  const file = join(folder, 'tent.ts')
  const from = "  state: { dark: { type: boolean(), in: 'device' } },\n"
  const text = readFileSync(file, 'utf8')
  assert.ok(text.includes(from))
  writeFileSync(
    file,
    text.replace(
      from,
      `${from}  onRequest: async (request, next) => {
    const url = new URL(request.url)
    const share = request.headers.get('x-share')
    if (share === 'b' && (url.pathname === '/news' || url.pathname === '/shared'))
      return next(new Request(new URL(url.pathname + '?tab=new', url), request))
    if (url.pathname === '/old-news') return next(new Request(new URL('/news', url), request))
    const answer = await next(request)
    if (share !== null) answer.headers.append('set-cookie', 'seen=' + share + '; Path=/')
    return answer
  },
`,
    ),
  )
}

/** How many times the app read a query, as its log of calls holds it, once the engine wrote what it answered. */
async function readOf(at: Served, name: string): Promise<number> {
  await new Promise((done) => setTimeout(done, 150))
  const log = new DatabaseSync(join(at.dataFolder, 'logs.db'), { readOnly: true })
  try {
    return Number(Object(log.prepare('SELECT count(*) AS n FROM calls WHERE name = ?').get(name)).n)
  } finally {
    log.close()
  }
}

test('[05-9.10] [32-11] a public screen of an app whose onRequest adds a cookie to every answer is sent with no-store, and no visitor is sent the cookie of another', async () => {
  const at = await served('cached', { change: handing })
  const one = await fetch(`${at.address}/shared`, { headers: { 'x-share': 'one' } })
  const other = await fetch(`${at.address}/shared`, { headers: { 'x-share': 'other' } })
  for (const [answer, cookie] of [
    [one, 'seen=one; Path=/'],
    [other, 'seen=other; Path=/'],
  ] as const) {
    assert.equal(answer.status, 200)
    assert.equal(answer.headers.get('cache-control'), 'no-store')
    assert.deepEqual(answer.headers.getSetCookie(), [cookie])
  }
  // A visitor to whose answer nothing was added is sent it as public, as before.
  const plain = await fetch(`${at.address}/shared`)
  assert.match(plain.headers.get('cache-control') ?? '', /^public/)
  assert.deepEqual(plain.headers.getSetCookie(), [])
})

test('[05-9.14] [05-9.17] [32-11] an answer to a request that onRequest handed on to another address says no-store, is drawn afresh each time, and is never kept for those who ask that address', async () => {
  const at = await served('cached', { change: handing })
  const handed = { headers: { 'x-share': 'b' } }
  // A public screen handed on, and /_t/screen of a public screen: both say no-store.
  const shared = await fetch(`${at.address}/shared`, handed)
  assert.equal(shared.status, 200)
  assert.equal(shared.headers.get('cache-control'), 'no-store')
  const again = await fetch(`${at.address}/_t/screen?path=${encodeURIComponent('/shared')}`)
  assert.equal(again.headers.get('cache-control'), 'no-store')
  // A cached screen handed on is drawn each time it is asked for, and what it drew is kept for nobody.
  const before = await readOf(at, 'allNews')
  for (let k = 0; k < 2; k++) {
    const news = await fetch(`${at.address}/news`, handed)
    assert.match(await news.text(), /The news (<!-- -->)?new</)
    assert.equal(news.headers.get('cache-control'), 'no-store')
  }
  const drawnTwice = await readOf(at, 'allNews')
  assert.ok(drawnTwice >= before + 2, `${before} ${drawnTwice}`)
  await (await fetch(`${at.address}/news?tab=new`)).text()
  const asked = await readOf(at, 'allNews')
  assert.ok(
    asked > drawnTwice,
    'the address asked by itself is drawn, and not sent what was drawn for a handed-on request',
  )
  // That answer is kept as any other: asked again, it draws nothing.
  await (await fetch(`${at.address}/news?tab=new`)).text()
  assert.equal(await readOf(at, 'allNews'), asked)
})

test('[21-12] [32-11] a page drawn for a request that onRequest handed on under another address is told the address that was asked, so the address of the browser and that of the page agree', async () => {
  const at = await served('cached', { change: handing })
  const answer = await fetch(`${at.address}/old-news`)
  assert.equal(answer.status, 200)
  const html = await answer.text()
  assert.match(html, /The news/)
  const record = JSON.parse(
    /<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)?.[1] ?? 'null',
  )
  assert.deepEqual([record.screen, record.path], ['newsScreen', '/old-news'])
})
