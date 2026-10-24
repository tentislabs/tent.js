import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp, TestReader } from '../index.ts'
import { testApp } from '../index.ts'
import { current, level } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** The app of the pages on three machines: a writer, a near reader and a far reader, joined and current. */
async function machines(t: TestContext): Promise<{
  app: TestApp
  near: TestReader
  far: TestReader
  calls(machine: string): Record<string, unknown>[]
}> {
  // The folders of the machines lie in the temporary place of the test: `data`, `reader-2` and `reader-3`.
  const temp = tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'pages') })
  closing(t, () => app.close())
  const near = await app.reader()
  const far = await app.reader({ far: true })
  await current(app, near, far)
  const calls = (machine: string): Record<string, unknown>[] => {
    const [home] = readdirSync(temp).filter((one) => one.startsWith('tent-test-'))
    const log = new DatabaseSync(join(temp, home ?? '', machine, 'logs.db'), { readOnly: true })
    try {
      return log.prepare('SELECT * FROM calls ORDER BY rowid').all()
    } finally {
      log.close()
    }
  }
  return { app, near, far, calls }
}

const origin = 'http://localhost'

/** A request of the web to one machine, with no network, from this computer. */
const ask = (machine: TestApp, path: string, o: { headers?: Record<string, string>; body?: unknown } = {}) =>
  machine.request(
    new Request(origin + path, {
      method: o.body === undefined ? 'GET' : 'POST',
      headers: { ...(o.body === undefined ? {} : { 'content-type': 'application/json' }), ...o.headers },
      ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }),
    }),
  )

/** What stands inside the element with the id `tent`. */
const drawingOf = (html: string): string =>
  /<div id="tent">([\s\S]*)<\/div>\n<script type="application\/json" id="tent-page">/.exec(html)?.[1] ?? ''

test('[29-3@5] a screen is answered by the reader with no request reaching the writer, and one whose data holds an action is handed on', async (t) => {
  const { near, far, calls } = await machines(t)
  const named = (machine: string, name: string, kind?: string): number =>
    calls(machine).filter((row) => row.name === name && (kind === undefined || row.kind === kind)).length

  for (const [reader, folder] of [
    [near, 'reader-2'],
    [far, 'reader-3'],
  ] as const) {
    // A screen of queries is drawn where it was asked for, from the rows that the reader holds.
    const before = calls('data').length
    const home = await ask(reader, '/')
    assert.equal(home.status, 200)
    assert.match(home.headers.get('tent-at') ?? '', /^1\.\d+$/)
    const drawn = drawingOf(await home.text())
    assert.ok(drawn.includes('>Ann</span>') && drawn.includes('$19.99'), drawn.slice(0, 400))
    assert.equal(calls('data').length, before, 'nothing reached the writer')
    assert.equal(named(folder, 'homeScreen', 'screen'), 1)
    assert.equal(named(folder, '/', 'handed'), 0)
    // So are an address that no screen fits, a file of the bundle, and a read of a query from a page.
    assert.equal((await ask(reader, '/nothing-here')).status, 404)
    const browser = Object(reader.description.browser)
    assert.equal((await ask(reader, `/_t/b/${browser.page.main}`)).status, 200)
    const read = await ask(reader, '/_t/read/openOrders', { body: { input: { limit: 1 } } })
    assert.equal(Object(await read.json()).value.length, 1)
    assert.equal(calls('data').length, before, 'nothing reached the writer')
    assert.equal(named(folder, 'openOrders'), 2)

    // A screen whose `data` holds an action is handed on before any of it has run: the writer calls the action
    // and draws the screen, and the reader passes its answer back.
    const rates = await ask(reader, '/rates')
    assert.equal(rates.status, 200)
    assert.ok(drawingOf(await rates.text()).includes('EUR <!-- -->0.9'))
    assert.equal(named(folder, '/rates', 'handed'), 1)
    assert.equal(named(folder, 'rates'), 0)
    assert.equal(named(folder, 'ratesScreen', 'screen'), 0)
  }
  assert.equal(named('data', 'rates'), 2)
  assert.equal(named('data', 'ratesScreen', 'screen'), 2)
  // A read of an action from a page is handed on too.
  const read = await ask(near, '/_t/read/rates', { body: { input: {} } })
  assert.deepEqual(Object(await read.json()).value, { base: 'USD', EUR: 0.9 })
  assert.equal(named('data', 'rates'), 3)
  assert.equal(named('reader-2', 'rates'), 0)
})

test('[29-3@5] a caller that a session the test made signed in is the same caller on the writer', async (t) => {
  const { app, near, calls } = await machines(t)
  const ada = await app.user({ email: 'ada@example.com', roles: ['staff'] })
  const id = String(ada.user?.id)
  // The writer writes the session, and the reader holds it by its copy of the sessions, as it holds every session.
  const cookie = app.session(id)
  await level(app, near)

  // A screen that the reader answers is drawn for that user.
  const account = await ask(near, '/account', { headers: { cookie } })
  assert.equal(account.status, 200)
  assert.ok((await account.text()).includes(id))
  // A screen that is handed on reaches the writer as that user: its action lets the staff alone in.
  const visitor = await ask(near, '/rates/staff')
  assert.equal(visitor.status, 302)
  const staff = await ask(near, '/rates/staff', { headers: { cookie } })
  assert.equal(staff.status, 200)
  assert.ok(drawingOf(await staff.text()).includes('EUR <!-- -->0.8'))
  const carried = calls('data').findLast((row) => row.name === 'staffRates')
  assert.deepEqual([carried?.callerKind, carried?.callerId, carried?.ok], ['user', id, 1])
  // So does a call of a change: the writer carries it out as the user of the session.
  const added = await ask(near, '/_t/call/addOrder', {
    headers: { cookie },
    body: { input: { name: 'Cy', total: 3 }, as: id },
  })
  assert.equal(added.status, 200)
  const call = calls('data').findLast((row) => row.name === 'addOrder')
  assert.deepEqual([call?.callerKind, call?.callerId], ['user', id])
})

test('[29-5@5] a request for a screen that names a mark is held to its highest number: the far reader waits for the write, and hands the request to the writer where it does not arrive', async (t) => {
  const { app, far, calls } = await machines(t)
  await level(app, far)
  far.hold()
  const wrote = await ask(app, '/_t/call/addOrder', { body: { input: { name: 'Newest', total: 7 } } })
  assert.equal(wrote.status, 200)
  const n = app.at().n
  assert.equal(wrote.headers.get('tent-wrote'), `1.orders:${n}`)
  const screens = (machine: string): number =>
    calls(machine).filter((row) => row.name === 'homeScreen' && row.kind === 'screen').length

  // With no mark the far reader answers what it holds, a moment behind.
  const behind = drawingOf(await (await ask(far, '/')).text())
  assert.equal(behind.includes('Newest'), false)
  assert.equal(screens('reader-3'), 1)
  // A mark holds a screen to its highest number, whatever table it names: a screen is no one query, so the
  // tables of the mark do not let it through. The request waits a moment, and is then the writer's to answer.
  for (const mark of [`1.${n}`, `1.orders:${n}`, `1.users:${n}`, `1.users:1,orders:${n}`]) {
    const [onWriter, onFar] = [screens('data'), screens('reader-3')]
    const began = performance.now()
    const held = await ask(far, '/', { headers: { 'tent-after': mark } })
    assert.ok(performance.now() - began >= 150, `${mark}: the request waited a moment for the write`)
    assert.equal(held.status, 200)
    assert.ok(drawingOf(await held.text()).includes('Newest'), mark)
    assert.deepEqual([screens('data'), screens('reader-3')], [onWriter + 1, onFar], mark)
  }
  // A mark that the reader holds already costs no wait: it answers the screen itself.
  const old = await ask(far, '/', { headers: { 'tent-after': `1.${n - 1}` } })
  assert.equal(drawingOf(await old.text()).includes('Newest'), false)
  assert.equal(screens('reader-3'), 2)
  // Once the write has arrived, the same mark is held by the reader itself.
  far.release()
  await level(app, far)
  const now = await ask(far, '/', { headers: { 'tent-after': `1.orders:${n}` } })
  assert.ok(drawingOf(await now.text()).includes('Newest'))
  assert.equal(screens('reader-3'), 3)
})

test('[29-3@5] app.page on a reader: a screen of queries is drawn there, and one whose data holds an action is sent on to the writer, as the caller that the code named', async (t) => {
  const { app, near, calls } = await machines(t)
  const ada = await app.user({ email: 'ada@example.com', roles: ['staff'] })
  await level(app, near)
  const named = (machine: string, name: string): number => calls(machine).filter((row) => row.name === name).length
  // A screen of queries: the reader draws it, and nothing reaches the writer.
  const before = calls('data').length
  const home = await near.page('/')
  assert.equal(home.status, 200)
  assert.ok(drawingOf(home.html).includes('>Ann</span>'))
  assert.equal(calls('data').length, before)
  // A screen with an action: the writer calls the action and draws the screen, and the reader answers what it drew.
  const rates = await near.page('/rates')
  assert.equal(rates.status, 200)
  assert.ok(drawingOf(rates.html).includes('EUR <!-- -->0.9'), drawingOf(rates.html))
  assert.equal(rates.headers['content-security-policy'].includes("default-src 'self'"), true)
  assert.deepEqual([named('data', 'rates'), named('reader-2', 'rates')], [1, 0])
  // The caller that the code named is the caller on the writer: the action of the staff lets them in, and sends
  // a visitor to the sign-in.
  const staff = await near.as(ada).page('/rates/staff')
  assert.equal(staff.status, 200)
  assert.ok(drawingOf(staff.html).includes('EUR <!-- -->0.8'))
  const carried = calls('data').findLast((row) => row.name === 'staffRates')
  assert.deepEqual([carried?.callerKind, carried?.callerId, carried?.ok], ['user', ada.user?.id, 1])
  const visitor = await near.as('nobody').page('/rates/staff')
  assert.equal(visitor.status, 302)
  assert.match(visitor.headers.location, /back=%2Frates%2Fstaff$/)
  assert.equal(named('reader-2', 'staffRates'), 0)
})
