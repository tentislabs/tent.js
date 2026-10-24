import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import { measure } from '../../../rig/budgets.ts'
import { buildProject } from '../../build/index.ts'
import type { Caller } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import { createEngine } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** Opens the test app of the project of the pages. It is closed when the test ends. */
async function pages(t: TestContext): Promise<TestApp> {
  const app = await testApp({ folder: copyOf(t, 'pages') })
  closing(t, () => app.close())
  return app
}

/** The page record of a document, read as the page code finds and reads it. */
function recordOf(html: string): Record<string, unknown> {
  const found = /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(html)
  assert.ok(found, `the document holds a page record: ${html.slice(0, 200)}`)
  return JSON.parse(found[1])
}

/** What stands inside the element with the id `tent`. */
const drawingOf = (html: string): string =>
  /<div id="tent">([\s\S]*)<\/div>\n<script type="application\/json" id="tent-page">/.exec(html)?.[1] ?? ''

/** A request of the web for an address of the test app, with no network. */
const got = (app: TestApp, path: string, headers: Record<string, string> = {}): Promise<Response> =>
  app.request(new Request(`http://shop.test${path}`, { headers }))

test('[31-6] the first HTML of a data screen holds its rows, and its page record holds the answers that the page comes alive with', async (t) => {
  const app = await pages(t)
  const page = await app.as('nobody').page('/')
  assert.equal(page.status, 200)
  assert.match(page.headers['content-type'], /^text\/html; charset=utf-8$/)
  // With scripts switched off a reader of the HTML has the rows: they are drawn into the document.
  const drawing = drawingOf(page.html)
  assert.ok(drawing.includes('>Ann</span>') && drawing.includes('$19.99') && drawing.includes('Oct 8, 2026'), drawing)
  assert.ok(drawing.includes('A visitor'))
  assert.ok(page.html.includes('<title>2 orders</title>'))
  // The page comes alive with the answers of the draw, and asks nothing of them a second time.
  const record = recordOf(page.html)
  const answers = Object(record.answers)
  assert.equal(answers.length, 1)
  assert.deepEqual(
    { what: answers[0].what, input: answers[0].input, entry: answers[0].entry },
    { what: 'openOrders', input: { limit: 10 }, entry: 'orders' },
  )
  assert.equal(answers[0].value.length, 2)
  assert.match(String(answers[0].mark), /^[0-9a-f]{16}$/)
  assert.deepEqual(
    {
      screen: record.screen,
      status: record.status,
      path: record.path,
      user: record.user,
      mode: record.mode,
      language: record.language,
      state: record.state,
    },
    {
      screen: 'homeScreen',
      status: 200,
      path: '/',
      user: null,
      mode: 'test',
      language: 'en',
      state: { mode: 'auto' },
    },
  )
  // The page names the files of the bundle that it loads, and each of them is served.
  const load = Object(record.load)
  const browser = Object(app.description.browser)
  // With them the style file that the screen file imports, and the part of forms, as the file imports `Form`. The
  // project has no `error` screen of its own: the page code draws its own where a view fails in the browser.
  // A module of development is named at its mark: by its file in the description, with the mark after it.
  const plain = (file: unknown): string => String(file).replace(/\?v=[0-9a-f]{12}$/, '')
  assert.deepEqual(
    { ...load, screen: plain(load.screen), styles: load.styles.map(plain) },
    {
      screen: browser.screens.homeScreen[0],
      parts: [Object(browser.page.parts).form],
      styles: browser.screens.homeScreen.slice(1),
      error: '',
    },
  )
  for (const file of [load.screen, ...load.styles, browser.page.main]) {
    assert.ok(page.html.includes(`/_t/b/${file}`), file)
    assert.equal((await got(app, `/_t/b/${file}`)).status, 200, file)
  }
  // The same answer for a request of the web, and for a signed-in user, who is the user of the page.
  const web = await got(app, '/')
  assert.equal(web.status, 200)
  // The page names the scheme and the name it was reached by, and is the same page in everything else.
  const html = await web.text()
  assert.equal(recordOf(html).origin, 'http://shop.test')
  assert.equal(drawingOf(html), drawingOf(page.html))
  const ada = await app.user({ email: 'ada@example.com', roles: ['staff'] })
  const signed = await app.as(ada).page('/')
  assert.deepEqual(recordOf(signed.html).user, ada.user)
  assert.ok(drawingOf(signed.html).includes(String(ada.user?.id)))
})

test('[31-4] each outcome of a request for a screen has its status: 302 with back, and 404 and 500 with the built-in screen', async (t) => {
  const app = await pages(t)
  const ada = await app.user({ email: 'ada@example.com', roles: ['staff'] })
  const bob = await app.user({ email: 'bob@example.com', roles: [] })
  // A screen that needs a signed-in caller, asked for by nobody: to the sign-in screen, with the address asked for.
  const away = await app.as('nobody').page('/account?tab=a&x=1')
  assert.equal(away.status, 302)
  assert.equal(away.headers.location, `/sign-in?back=${encodeURIComponent('/account?tab=a&x=1')}`)
  assert.equal(away.html, '')
  assert.equal((await app.as('nobody').page('/staff')).status, 302)
  assert.equal((await app.as(bob).page('/account')).status, 200)
  // A signed-in caller whom the rule does not let in learns nothing of the screen: it is not found.
  const kept = await app.as(bob).page('/staff')
  assert.equal(kept.status, 404)
  assert.equal((await app.as(ada).page('/staff')).status, 200)
  // An address that no screen has, and one that is no address of the app at all.
  const unknown = await app.as('nobody').page('/nothing/here')
  assert.equal(unknown.status, 404)
  for (const path of ['//evil.example', '/a//b', '/a\\b', '/a%2F%2Fb', '/a%00b'])
    assert.equal((await app.as('nobody').page(path)).status, 404, path)
  // The built-in screen: one line of words, the same for every 404, drawn and sent like any screen.
  for (const page of [kept, unknown]) {
    assert.ok(drawingOf(page.html).includes('This page could not be found.'), page.html)
    assert.deepEqual([recordOf(page.html).screen, recordOf(page.html).status], ['tent.notFound', 404])
  }
  assert.equal(drawingOf(kept.html), drawingOf(unknown.html))
  // An entry of the screen's own that a signed-in caller may not read, and for nobody the way to the sign-in.
  assert.equal((await app.as(bob).page('/mixed')).status, 404)
  assert.equal((await app.as('nobody').page('/mixed')).status, 302)
  // A bad value of the address, and a `needed` entry that answers nothing.
  assert.equal((await app.as('nobody').page('/orders/123')).status, 404)
  assert.equal((await app.as('nobody').page('/orders/Nobody')).status, 404)
  const found = await app.as('nobody').page('/orders/Ann?tab=paid')
  assert.equal(found.status, 200)
  assert.ok(drawingOf(found.html).includes('paid<!-- --> of <!-- -->Ann'))
  assert.deepEqual(recordOf(found.html).params, { name: 'Ann' })
  // Of two screens that fit, the more exact one wins, and the rest of a pattern is one value.
  assert.ok(drawingOf((await app.as('nobody').page('/orders/new')).html).includes('A new order'))
  assert.ok(drawingOf((await app.as('nobody').page('/docs/a/b%20c')).html).includes('Docs: <!-- -->a/b c'))
  // An address that ends in a slash is answered with the same one without it.
  const slash = await app.as('nobody').page('/orders/Ann/?tab=paid')
  assert.deepEqual([slash.status, slash.headers.location], [308, '/orders/Ann?tab=paid'])
  // View code that fails: the `error` screen, status 500, and in the mode `test` the error is shown.
  const broken = await app.as('nobody').page('/broken')
  assert.equal(broken.status, 500)
  assert.equal(recordOf(broken.html).screen, 'tent.error')
  assert.ok(drawingOf(broken.html).includes('Something went wrong'))
  assert.ok(drawingOf(broken.html).includes('the view broke'))
  assert.equal(Object(recordOf(broken.html).error).code, 'T0009')
  // A screen with `server: false` is sent with its answers and no drawing.
  const late = await app.as('nobody').page('/late')
  assert.equal(late.status, 200)
  assert.equal(drawingOf(late.html), '')
  assert.equal(Object(recordOf(late.html).answers)[0].value.length, 1)
  // A view that asks with `useQuery` is drawn with its rows, and its asking is among the answers.
  const hook = await app.as('nobody').page('/query')
  assert.ok(drawingOf(hook.html).includes('2<!-- --> by a hook'), hook.html)
  assert.deepEqual(Object(recordOf(hook.html).answers)[0].input, { limit: 3 })
})

test('[31-7] a date reaches a view as text, and a date that a page sends travels as text and is handed to the function as a Date', async (t) => {
  const app = await pages(t)
  const page = await app.as('nobody').page('/orders/Ann')
  const [answer] = Object(recordOf(page.html).answers)
  assert.equal(answer.value.placedAt, '2026-10-08T09:30:00.000Z')
  assert.ok(drawingOf(page.html).includes('<span>string</span>'))
  const sent = await app.request(
    new Request('http://shop.test/_t/call/whenIs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { at: '2026-10-08T09:30:00.000Z' } }),
    }),
  )
  assert.deepEqual(await sent.json(), { ok: true, value: { isDate: true, year: 2026 } })
})

test('[31-9] GET /_t/b/ serves a file of browser/ and of assets/ that the description names, and refuses everything else of the bundle', async (t) => {
  const app = await pages(t)
  const browser = Object(app.description.browser)
  const asset = Object(Object(app.description.assets)['extra.txt']).file
  const main = await got(app, `/_t/b/${browser.page.main}`)
  assert.equal(main.status, 200)
  assert.equal(main.headers.get('content-type'), 'text/javascript; charset=utf-8')
  // The files are the same for every caller, and one that did not change keeps its address: it is kept for a year.
  assert.equal(main.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(main.headers.get('x-content-type-options'), 'nosniff')
  assert.ok((await main.text()).length > 100000)
  const style = String(browser.screens.homeScreen[1])
  const styles = await got(app, `/_t/b/${style}`)
  assert.equal(styles.headers.get('content-type'), 'text/css; charset=utf-8')
  assert.match(await styles.text(), /^@layer shop/)
  assert.equal(await (await got(app, `/_t/b/${asset}`)).text(), 'body { color: red }\n')
  // A browser that takes Brotli is sent the file packed, and what it unpacks is the file.
  const packed = await got(app, `/_t/b/${style}`, { 'accept-encoding': 'gzip, br' })
  assert.equal(packed.headers.get('content-encoding'), 'br')
  assert.equal(packed.headers.get('vary'), 'Accept-Encoding')
  const bytes = new Uint8Array(await packed.arrayBuffer())
  assert.match(brotliDecompressSync(bytes).toString('utf8'), /^@layer shop/)
  // Nothing else of the bundle is served: its description, its server files, and a path that climbs out of it.
  const server = Object(app.description.server)
  for (const path of [
    'description.json',
    'description.schema.json',
    server.screens,
    'browser/',
    'browser/nothing.js',
    `browser/../${server.screens}`,
    `browser/%2e%2e/${server.screens}`,
    '../description.json',
    `assets/..%2Fdescription.json`,
    `${style}/..`,
  ]) {
    const refused = await got(app, `/_t/b/${path}`)
    assert.equal(refused.status, 404, path)
    assert.equal(Object(await refused.json()).error.code, 'T0001', path)
  }
  assert.equal((await app.request(new Request(`http://shop.test/_t/b/${style}`, { method: 'POST' }))).status, 404)
})

test('[21-10] every page carries the headers that the engine sets, a script that a row writes is not run, and a page is framed by nobody unless its screen says so', async (t) => {
  const app = await pages(t)
  const page = await app.as('nobody').page('/')
  const origin = String(recordOf(page.html).origin)
  assert.equal(origin, 'http://localhost')
  assert.equal(page.headers['x-content-type-options'], 'nosniff')
  assert.equal(page.headers['referrer-policy'], 'strict-origin-when-cross-origin')
  assert.equal(page.headers['cache-control'], 'no-store')
  // The camera is opened by `unlock`, for the app's own address, and nothing else of the device.
  assert.equal(page.headers['permissions-policy'], 'camera=(self), microphone=(), geolocation=()')
  const policy = Object.fromEntries(
    page.headers['content-security-policy'].split('; ').map((line) => [line.split(' ')[0], line.split(' ').slice(1)]),
  )
  // A style tag and a script of the head are let in by the nonce of the page, which its record holds.
  const nonce = `'nonce-${String(recordOf(page.html).nonce)}'`
  assert.deepEqual(policy, {
    'default-src': ["'self'"],
    'script-src': [`${origin}/_t/b/`, nonce, 'https://js.example.com'],
    'style-src': [`${origin}/_t/b/`, nonce],
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://img.example.com'],
    'media-src': ["'self'", 'blob:', 'https://img.example.com'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", 'ws://localhost', 'https://img.example.com'],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
  })
  // No script that is written into a page is run: the policy names files alone, and the text of a row is text.
  assert.ok(!page.html.includes('<script>window.pwned'))
  assert.ok(page.html.includes('Bo &lt;/script&gt;&lt;script&gt;window.pwned = 1&lt;/script&gt;'))
  assert.equal(page.html.split('<script').length - 1, 2, 'the page record and the main file of the page code')
  // A screen that states `framedBy` may be shown by those sites, and every other page by nobody.
  const framed = await app.as('nobody').page('/docs/a')
  assert.match(framed.headers['content-security-policy'], /frame-ancestors https:\/\/studio\.example\.com;/)
  // Every outcome is a page: the built-in screens carry the same headers, each with a nonce of its own.
  const unnamed = (written: string): string => written.replace(/'nonce-[^']+'/g, "'nonce'")
  for (const path of ['/nothing', '/broken']) {
    const other = await app.as('nobody').page(path)
    assert.equal(
      unnamed(other.headers['content-security-policy']),
      unnamed(page.headers['content-security-policy']),
      path,
    )
    assert.notEqual(other.headers['content-security-policy'], page.headers['content-security-policy'], path)
    assert.equal(other.headers['cache-control'], 'no-store')
  }
})

test('[31-15@5] an action in data: the first HTML holds its answer, its rule is checked for the caller, and a failure of it draws the error screen', async (t) => {
  const app = await pages(t)
  const page = await app.as('nobody').page('/rates')
  assert.equal(page.status, 200)
  assert.ok(drawingOf(page.html).includes('EUR <!-- -->0.9'), page.html)
  // The rule of the action is checked for the caller of the page.
  assert.equal((await app.as('nobody').page('/rates/staff')).status, 302)
  const ada = await app.user({ email: 'ada@example.com', roles: ['staff'] })
  assert.ok(drawingOf((await app.as(ada).page('/rates/staff')).html).includes('EUR <!-- -->0.8'))
  // A failure of it draws the `error` screen, with the status of the error.
  const failed = await app.as('nobody').page('/failing')
  assert.equal(failed.status, 500)
  assert.equal(recordOf(failed.html).screen, 'tent.error')
  assert.ok(!drawingOf(failed.html).includes('Never drawn'))
})

test('[31-16] wait: false: the page is sent without waiting for the entry, which the page asks when it has come alive', async (t) => {
  const app = await pages(t)
  const page = await app.as('nobody').page('/rates')
  assert.ok(drawingOf(page.html).includes('Asking'))
  const answers = Object(recordOf(page.html).answers)
  assert.deepEqual(
    answers.map((one: Record<string, unknown>) => [one.entry, one.left, one.value === undefined]).sort(),
    [
      ['later', 'wait', true],
      ['rates', undefined, false],
    ],
  )
})

test('[31-15@5] a read from the page goes through the door at /_t/read/: it takes a query or an action and nothing else', async (t) => {
  const app = await pages(t)
  const read = async (name: string, input: unknown = {}) => {
    const answer = await app.request(
      new Request(`http://shop.test/_t/read/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
      }),
    )
    return { status: answer.status, body: Object(await answer.json()) }
  }
  const orders = await read('openOrders', { limit: 1 })
  assert.equal(orders.status, 200)
  assert.equal(orders.body.value.length, 1)
  assert.deepEqual((await read('rates', { base: 'EUR' })).body, { ok: true, value: { base: 'EUR', EUR: 0.9 } })
  // A change is no read, and neither is a name that is no function.
  assert.deepEqual(
    [
      (await read('addOrder', { name: 'x', total: 1 })).status,
      (await read('addOrder', { name: 'x', total: 1 })).body.error.code,
    ],
    [404, 'T0001'],
  )
  assert.equal((await read('nothing')).body.error.code, 'T0001')
  assert.equal((await app.rows('orders')).length, 2)
  // The rule of what is read holds for the caller of the request.
  assert.equal((await read('staffOrders')).body.error.code, 'T0006')
})

test('[31-15@5] an action that calls a change, read as data, writes nothing: the page is the error screen with T0009, also when the page asks the entry again', async (t) => {
  const app = await pages(t)
  const post = async (address: string) => {
    const answer = await app.request(
      new Request('http://shop.test' + address, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      }),
    )
    return Object(await answer.json())
  }
  // A screen is asked for by a plain GET, so an action that is read only reads: its change is refused.
  const page = await app.as('nobody').page('/sneaky')
  assert.equal(page.status, 500)
  assert.equal(Object(recordOf(page.html).error).code, 'T0009')
  assert.equal((await app.rows('orders')).length, 2)
  // The same holds every time the page asks the entry again, at the address of a read.
  assert.equal((await post('/_t/read/sneaky')).error.code, 'T0009')
  assert.equal((await app.rows('orders')).length, 2)
  // An action that must write is called by a press, at the address of a call: there it writes.
  assert.deepEqual(await post('/_t/call/sneaky'), { ok: true })
  assert.equal((await app.rows('orders')).length, 3)
})

test('[11-2@5] a screen reads its data with the rights of the caller that asked for it', async (t) => {
  const app = await pages(t)
  const ada = await app.user({ email: 'ada@example.com', roles: ['staff'] })
  const bob = await app.user({ email: 'bob@example.com', roles: [] })
  // The same screen, the same entry: the staff is answered, and another signed-in caller is not let in.
  assert.ok(drawingOf((await app.as(ada).page('/mixed')).html).includes('2<!-- --> mixed'))
  assert.equal((await app.as(bob).page('/mixed')).status, 404)
  // What a page was answered is in the log as a call of that caller.
  assert.equal((await app.as('system').page('/staff')).status, 200)
})

test('[31-6] the file of the page code that every page loads and one simple screen are within the budget of a page, packed as the engine sends them', async (t) => {
  // The bar counts what a release holds: the small form of the page code and the module of one simple screen, each
  // packed with Brotli as the engine packs a file of a bundle.
  const made = await buildProject(copyOf(t, 'plain'), { for: 'release' })
  assert.deepEqual(made.findings, [])
  const browser = Object(made.description.browser)
  const files: string[] = [browser.page.main, ...browser.screens.homeScreen]
  const packed = (): number =>
    files.reduce((sum, file) => sum + brotliCompressSync(readFileSync(join(made.bundleFolder, file))).length, 0)
  const weight = await measure('page.weight', packed, { unit: 'bytes' })
  assert.ok(weight > 20000, 'the measure counts the page code')
})

test('[31-6] in the mode test the engine sends the files of a release packed as on live data, so what a browser receives of the page code and one simple screen is what the budget of a page counts', async (t) => {
  const made = await buildProject(copyOf(t, 'plain'), { for: 'release' })
  assert.deepEqual(made.findings, [])
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const dataFolder = join(tempOf(t), 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  // The engine answers the names of this computer, on its own port.
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const asked = (file: string, headers: Record<string, string> = {}): Promise<Response> =>
    app.request(new Request(`http://localhost:${port}/_t/b/${file}`, { headers }))
  const browser = Object(made.description.browser)
  for (const file of [browser.page.main, ...browser.screens.homeScreen]) {
    const whole = new Uint8Array(await (await asked(file)).arrayBuffer())
    const sent = await asked(file, { 'accept-encoding': 'gzip, deflate, br' })
    assert.equal(sent.headers.get('content-encoding'), 'br', file)
    assert.equal((await sent.arrayBuffer()).byteLength, brotliCompressSync(whole).length, file)
  }
})

test('[32-4@5] the door refuses a value that does not fit its type, when a program sends what the browser would have held back', async (t) => {
  const app = await pages(t)
  const sent = await app.request(
    new Request('http://shop.test/_t/call/addOrder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { name: 'Cy', total: -5 } }),
    }),
  )
  assert.equal(sent.status, 400)
  const { error } = Object(await sent.json())
  assert.deepEqual([error.code, error.fields], ['T0002', { total: 'min' }])
  assert.equal((await app.rows('orders')).length, 2)
})

test('[31-15@5] an action that calls a change, read as data: the log holds T0013, for the change and for the action', async (t) => {
  const made = await buildProject(copyOf(t, 'pages'), { for: 'dev' })
  assert.deepEqual(made.findings, [])
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const dataFolder = join(tempOf(t), 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  assert.equal((await app.page('/sneaky')).status, 500)
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    const calls = log.prepare('SELECT name, kind, ok, code FROM calls ORDER BY rowid').all()
    assert.deepEqual(
      calls.filter((row) => row.kind !== 'screen').map((row) => [row.name, row.kind, row.ok, row.code]),
      [
        ['addOrder', 'change', 0, 'T0013'],
        ['sneaky', 'action', 0, 'T0013'],
      ],
    )
    const errors = log.prepare('SELECT name, message FROM errors').all()
    assert.equal(errors.length, 1)
    assert.match(String(errors[0].message), /read-only/)
  } finally {
    log.close()
  }
})

test('[31-15@5] a request for a screen is counted for its address on screensPerMinute, and an action that a screen reads counts as one call of its caller: past the count the page is the error screen with T0005', async (t) => {
  const folder = copyOf(t, 'pages')
  const file = join(folder, 'tent.ts')
  const written = readFileSync(file, 'utf8')
  assert.match(written, /project\('shop', \{/)
  writeFileSync(
    file,
    written.replace("project('shop', {", "project('shop', {\n  limits: { anyonePerMinute: 2, screensPerMinute: 5 },"),
  )
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const get = (path: string, from = '127.0.0.1'): Promise<Response> =>
    app.request(new Request(`http://localhost${path}`), { from })

  // `/rates` reads an action: each request for it is one call of the visitor, of which two are taken in a minute.
  const seen: [number, unknown][] = []
  for (let k = 0; k < 3; k++) {
    const answer = await get('/rates')
    const record = JSON.parse(/id="tent-page">([\s\S]*?)<\/script>/.exec(await answer.text())?.[1] ?? '{}')
    seen.push([answer.status, record.error?.code])
  }
  assert.deepEqual(seen, [
    [200, undefined],
    [200, undefined],
    [429, 'T0005'],
  ])
  // A screen that reads no action counts on the screens alone: five in a minute for one address, and the sixth is refused.
  assert.equal((await get('/orders/new')).status, 200)
  assert.equal((await get('/orders/new')).status, 200)
  const sixth = await get('/orders/new')
  assert.equal(sixth.status, 429)
  assert.equal(Object(await sixth.json()).error.code, 'T0005')
  // Another address has counts of its own.
  assert.equal((await get('/orders/new', '127.0.0.2')).status, 200)
  // A file of the bundle is counted by nothing.
  const browser = Object(app.description.browser)
  assert.equal((await get(`/_t/b/${browser.page.main}`)).status, 200)
  // A caller that a session signed in is counted as who they are: past the count of the visitors of an address, the
  // screen that reads an action is still answered to them there.
  const maya = await app.user({ email: 'maya@example.com', roles: [] })
  const cookie = app.session(maya)
  assert.deepEqual([(await get('/rates', '127.0.0.9')).status, (await get('/rates', '127.0.0.9')).status], [200, 200])
  assert.equal((await get('/rates', '127.0.0.9')).status, 429)
  const signed = await app.request(new Request('http://localhost/rates', { headers: { cookie } }), {
    from: '127.0.0.9',
  })
  assert.equal(signed.status, 200)
})

test('[16-4@5] a request for a screen is one row of calls of the kind screen: its name is the name of the screen, and the path where no screen answers, and ok and code say how it ended', async (t) => {
  const made = await buildProject(copyOf(t, 'pages'), { for: 'dev' })
  assert.deepEqual(made.findings, [])
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const dataFolder = join(tempOf(t), 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  await app.seed()
  const bob: Caller = { kind: 'user', user: { id: 'u1', roles: [] } }
  const asked: [string, 'nobody' | Caller, number][] = [
    ['/', 'nobody', 200],
    ['/nothing-here', 'nobody', 404],
    ['/account', 'nobody', 302],
    ['/staff', bob, 404],
    ['/orders/Zed', 'nobody', 404],
    ['/broken', 'nobody', 500],
    ['/sneaky', 'nobody', 500],
    ['/orders/new/', 'nobody', 308],
    ['/nothing-here/', 'nobody', 308],
  ]
  for (const [path, as, status] of asked) assert.equal((await app.page(path, { as })).status, status, path)
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    const rows = log
      .prepare("SELECT name, ok, code, ref, callerKind FROM calls WHERE kind = 'screen' ORDER BY rowid")
      .all()
    assert.deepEqual(
      rows.map((row) => [row.name, row.ok, row.code]),
      [
        ['homeScreen', 1, null],
        ['/nothing-here', 0, 'T0001'],
        ['accountScreen', 0, 'T0006'],
        ['staffScreen', 0, 'T3101'],
        ['orderScreen', 0, 'T0001'],
        ['brokenScreen', 0, 'T0009'],
        ['sneakyScreen', 0, 'T0013'],
        // An address with a slash at its end is answered with a move, and is written under the name of its screen.
        ['exactScreen', 1, null],
        ['/nothing-here/', 1, null],
      ],
    )
    assert.deepEqual(
      rows.map((row) => row.callerKind),
      ['nobody', 'nobody', 'nobody', 'user', 'nobody', 'nobody', 'nobody', 'nobody', 'nobody'],
    )
    // A failure that is not the caller's to see is found in errors by the ref of its row, written once.
    const errors = log.prepare('SELECT ref, message FROM errors').all()
    for (const k of [5, 6])
      assert.equal(errors.filter((one) => one.ref === rows[k].ref).length, 1, String(rows[k].name))
    assert.match(String(errors.find((one) => one.ref === rows[5].ref)?.message), /the view broke/)
    for (const k of [0, 1, 2, 3, 4, 7, 8]) assert.equal(rows[k].ref, null)
  } finally {
    log.close()
  }
})

test('[30-2] a Link to a screen that is defined in the same file draws its link in the first HTML, as from another file', async (t) => {
  const app = await pages(t)
  const plain = drawingOf((await app.as('nobody').page('/forms')).html)
  assert.match(plain, /<a href="\/press">To the presses<\/a>/)
  // A screen that stands later in the file, and one with a value of a row in its address.
  const first = drawingOf((await app.as('nobody').page('/press')).html)
  assert.match(first, /<a href="\/forms">To the forms<\/a>/)
  assert.match(first, /<a href="\/rows\/Ann\?tab=open">Ann<\/a>/)
  // Its path, with the value of the address and the state it keeps there.
  const code = drawingOf((await app.as('nobody').page('/unlocked')).html)
  assert.match(code, /<a href="\/linked\/7\?tab=open">To the linked one<\/a>/)
  const mixed = drawingOf((await app.as('nobody').page('/linked/7')).html)
  assert.match(mixed, /<a href="\/unlocked">Back<\/a>/)
})

test('[16-4@5] a value of the address stands in no row of the log for a screen that answers: an address may carry a code', async (t) => {
  const made = await buildProject(copyOf(t, 'pages'), { for: 'dev' })
  assert.deepEqual(made.findings, [])
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const dataFolder = join(tempOf(t), 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  await app.call('addOrder', { name: 'ZetaCodeValue', total: 1 }, { as: { kind: 'system' } })
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  // By a program and through the door: a value of the pattern, and a state that the address keeps.
  const path = '/orders/ZetaCodeValue?tab=TabCodeValue'
  assert.equal((await app.page(path)).status, 200)
  const web = await app.request(new Request(`http://localhost:${port}${path}`))
  assert.equal(web.status, 200)
  assert.match(await web.text(), /ZetaCodeValue/)
  assert.equal(
    (await app.request(new Request(`http://localhost:${port}/rows/RowCodeValue?tab=TabCodeValue`))).status,
    200,
  )
  // The same address with a slash at its end is answered with a move, and leaves no value in the log either.
  const moved = await app.request(
    new Request(`http://localhost:${port}/rows/SlashCodeValue/?tab=TabCodeValue`, { redirect: 'manual' }),
  )
  assert.equal(moved.status, 308)
  assert.equal(moved.headers.get('location'), '/rows/SlashCodeValue?tab=TabCodeValue')
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    const tables = log.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    const held = tables
      .map((table) => JSON.stringify(log.prepare(`SELECT * FROM "${String(table.name)}"`).all()))
      .join('\n')
    // The log was written: the screens stand in it by their names.
    assert.match(held, /"orderScreen"/)
    assert.match(held, /"rowScreen"/)
    for (const value of ['ZetaCodeValue', 'TabCodeValue', 'RowCodeValue', 'SlashCodeValue'])
      assert.equal(held.includes(value), false, `${value} stands in the log`)
  } finally {
    log.close()
  }
})

test('[31-3] when the passes of a draw are used up, an entry that is still open is answered left: open, and the page is sent with no drawing for the browser to ask it', async (t) => {
  const folder = copyOf(t, 'pages')
  const file = join(folder, 'tent.ts')
  const written = readFileSync(file, 'utf8')
  assert.match(written, /project\('shop', \{/)
  writeFileSync(file, written.replace("project('shop', {", "project('shop', {\n  limits: { drawPasses: 1 },"))
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const page = await app.as('nobody').page('/rates')
  assert.equal(page.status, 200, page.html.slice(0, 300))
  const record = recordOf(page.html)
  assert.equal(record.screen, 'ratesScreen')
  assert.deepEqual(
    Object(record.answers)
      .map((one: Record<string, unknown>) => [one.entry, one.left, one.value === undefined])
      .sort(),
    [
      ['later', 'wait', true],
      ['rates', 'open', true],
    ],
  )
  // No view is run without the entry that its screen waits for: the browser draws it with the answer.
  assert.equal(drawingOf(page.html), '')
  // A query answers at once, in the last pass as in any other.
  const home = await app.as('nobody').page('/')
  assert.equal(home.status, 200)
  assert.ok(drawingOf(home.html).includes('Orders'))
  // With the passes of the default the same screen is drawn with its answer.
  const whole = await pages(t)
  assert.ok(drawingOf((await whole.as('nobody').page('/rates')).html).includes('EUR <!-- -->0.9'))
})

test("[31-4] a page names the module of the project's own error screen in load.error, under the name tent.error, and with none names none", async (t) => {
  const plain = await buildProject(copyOf(t, 'pages'), { for: 'release' })
  assert.deepEqual(plain.findings, [])
  assert.equal(Object(plain.description.browser).screens['tent.error'], undefined)
  const app = await pages(t)
  for (const path of ['/', '/rates', '/query'])
    assert.equal(Object(recordOf((await app.as('nobody').page(path)).html).load).error, '', path)
  // A project with an `error` screen of its own: its module stands under `tent.error`, and every page names it.
  const folder = copyOf(t, 'pages')
  writeFileSync(
    join(folder, 'failed.tsx'),
    "import { screen } from 'tentjs/ui'\n\nexport const failedScreen = screen('failedScreen', { for: 'error', access: 'anyone', view: () => <h1>It broke</h1> })\n",
  )
  const own = await testApp({ folder })
  closing(t, () => own.close())
  const browser = Object(own.description.browser)
  assert.deepEqual(browser.screens['tent.error'], browser.screens.failedScreen)
  for (const path of ['/', '/rates'])
    assert.equal(
      // A module of development is named at its mark.
      String(Object(recordOf((await own.as('nobody').page(path)).html).load).error).replace(/\?v=[0-9a-f]{12}$/, ''),
      browser.screens.failedScreen[0],
      path,
    )
  assert.equal((await got(own, `/_t/b/${browser.screens.failedScreen[0]}`)).status, 200)
})

test('[31-4] a draw that takes longer than 50 ms is written to the slow table of the log, under the name of its screen, and a quick one is not', async (t) => {
  const made = await buildProject(copyOf(t, 'pages'), { for: 'dev' })
  assert.deepEqual(made.findings, [])
  // A draw is timed by the clock of the app, which the test hands in: it stands still, or runs as the clock of this
  // computer does. So what is written is told by the draw itself, and by no load of this computer.
  let runs = false
  const stood = Date.now()
  const clock: Clock = {
    now: () => (runs ? Date.now() : stood),
    setTimer(at, fn) {
      const timer = setTimeout(fn, Math.max(0, at - Date.now()))
      return () => clearTimeout(timer)
    },
  }
  const engine = createEngine({ port: 0, makers: { clock: () => clock } })
  closing(t, () => engine.close())
  const dataFolder = join(tempOf(t), 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  await app.seed()
  // While the clock stands, no draw takes any time: neither screen is written, however long this computer took.
  assert.equal((await app.page('/orders/new', { as: 'nobody' })).status, 200)
  assert.equal((await app.page('/slow', { as: 'nobody' })).status, 200)
  // While it runs, the screen that keeps the drawing busy for 80 ms is written, and the quick one beside it is not
  // held to any time.
  runs = true
  assert.equal((await app.page('/slow', { as: 'nobody' })).status, 200)
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    const rows = log.prepare('SELECT name, ms FROM slow ORDER BY rowid').all()
    assert.deepEqual(
      rows.map((row) => row.name),
      ['slowScreen'],
    )
    assert.ok(Number(rows[0].ms) >= 50, String(rows[0].ms))
  } finally {
    log.close()
  }
})

test('[31-6@6] the record of a page holds optimisticKept, in milliseconds, where the project states another time than two seconds, and holds none where it states none', async (t) => {
  const plain = await pages(t)
  assert.equal('optimisticKept' in recordOf((await plain.as('nobody').page('/')).html), false)
  const folder = copyOf(t, 'pages')
  const file = join(folder, 'tent.ts')
  const stated = "title: 'Shop',"
  assert.ok(readFileSync(file, 'utf8').includes(stated))
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(stated, `${stated}\n  limits: { optimisticKept: '5 seconds' },`),
  )
  const app = await testApp({ folder })
  closing(t, () => app.close())
  for (const path of ['/', '/no-such-screen'])
    assert.equal(recordOf((await app.as('nobody').page(path)).html).optimisticKept, 5000, path)
})
