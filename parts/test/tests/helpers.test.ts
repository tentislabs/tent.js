import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf, filesIn, tempOf } from './projects.ts'

/** Opens a test app of a project of the tests, on a temporary place of the test. It is closed when the test ends. */
async function opened(t: TestContext, name: string): Promise<{ app: TestApp; temp: string; project: string }> {
  const temp = tempOf(t)
  const project = copyOf(t, name)
  const app = await testApp({ folder: project })
  closing(t, () => app.close())
  return { app, temp, project }
}

const day = 86_400_000

/** What one column of the rows of a table holds, in the order of the values. */
const column = async (app: TestApp, table: string, name: string): Promise<unknown[]> =>
  (await app.rows(table)).map((row) => row[name]).sort()

let senders = 0

/** Sends a call to a test app as a request of the web, with no network, and answers its status and what it was answered. */
async function sent(
  app: TestApp,
  name: string,
  o: { headers?: Record<string, string>; fields?: Record<string, unknown>; from?: string } = {},
): Promise<{ status: number; value: unknown; code: unknown }> {
  // Each request comes from an address of its own where the test names none, so that no count of a minute holds it.
  const from = o.from ?? `10.1.${Math.floor(++senders / 250)}.${senders % 250}`
  const request = new Request(`http://shop.test/_t/call/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...o.headers },
    body: JSON.stringify({ input: {}, ...o.fields }),
  })
  const response = await app.request(request, { from })
  const body: Record<string, unknown> = Object(await response.json())
  return { status: response.status, value: body.value, code: Object(body.error).code }
}

test('[17-1] a test app is built from the project, opened on empty temporary data with the seed applied, and leaves no file behind', async (t) => {
  const temp = tempOf(t)
  const project = copyOf(t, 'shop')
  const before = filesIn(project)
  const app = await testApp({ folder: project })
  closing(t, () => app.close())
  assert.equal(app.description.app.name, 'shop')
  assert.equal(Object.hasOwn(app.description.functions, 'markPaid'), true)

  // The data and the bundle lie in the temporary place, and the engine runs the app on test data.
  const [engineFile, ...others] = filesIn(temp).filter((name) => name.endsWith('/engine.json'))
  assert.ok(engineFile)
  assert.deepEqual(others, [])
  const engine: Record<string, unknown> = JSON.parse(readFileSync(join(temp, engineFile), 'utf8'))
  assert.equal(engine.mode, 'test')
  assert.equal(filesIn(temp).filter((name) => name.endsWith('/description.json')).length >= 1, true)

  // The seed was applied to data that held nothing else.
  assert.deepEqual(await column(app, 'users', 'name'), ['Ada', 'Bob'])
  assert.deepEqual(await column(app, 'orders', 'title'), ['A chair', 'A desk', 'A lamp'])

  // A second test app of the same project has data of its own.
  const second = await testApp({ folder: project })
  closing(t, () => second.close())
  await second.user({ name: 'Cy', roles: [] })
  assert.deepEqual(await column(second, 'users', 'name'), ['Ada', 'Bob', 'Cy'])
  assert.deepEqual(await column(app, 'users', 'name'), ['Ada', 'Bob'])
  await second.close()

  const health = `http://127.0.0.1:${Number(engine.port)}/_t/health`
  const answered: Record<string, unknown> = Object(await (await fetch(health)).json())
  assert.deepEqual(Object(answered.value).app, 'shop')

  await app.close()
  await app.close()
  assert.deepEqual(readdirSync(temp), [])
  // A build writes the type list and what it keeps for the next build into the project, as `tent build` does.
  const after = filesIn(project).filter((name) => name !== 'tent.d.ts' && !name.startsWith('.tent/cache/'))
  assert.deepEqual(after, before)
  await assert.rejects(fetch(health))
  await assert.rejects(app.rows('users'), { code: 'T0013' })
})

test('[17-1] a project that does not build opens no test app, and leaves no file behind', async (t) => {
  const temp = tempOf(t)
  const project = copyOf(t, 'broken')
  await assert.rejects(testApp({ folder: project }), (error: unknown) => {
    assert.equal(Reflect.get(Object(error), 'code'), 'T1001')
    assert.match(String(Reflect.get(Object(error), 'message')), /tent\.ts/)
    return true
  })
  assert.deepEqual(readdirSync(temp), [])
})

test('[17-1] a test caller: `user` adds a row and answers a caller, `as` calls as a caller, an id, nobody or the system, and `rows` reads every row', async (t) => {
  const { app } = await opened(t, 'shop')
  const users = await app.rows('users')
  const ada = String(users.find((row) => row.name === 'Ada')?.id)
  const bob = String(users.find((row) => row.name === 'Bob')?.id)

  const maya = await app.user({ name: 'Maya', roles: ['staff'] })
  const row = (await app.rows('users')).find((one) => one.name === 'Maya')
  assert.deepEqual(maya, { kind: 'user', user: { id: row?.id, roles: ['staff'] } })
  const cy = await app.user({ name: 'Cy', roles: [] })
  assert.deepEqual(cy.user?.roles, [])

  // A caller, as it is: its rights are those of the caller it names.
  assert.equal(await app.as(maya).call('whoAmI', {}), maya.user?.id)
  assert.equal(await app.as(maya).call({ definition: 'staffOnly' }, {}), maya.user?.id)
  await assert.rejects(app.as(cy).call('staffOnly', {}), { code: 'T3101' })

  // The id of a user, such as one the seed made: the roles are those of its row.
  assert.equal(await app.as(ada).call('staffOnly', {}), ada)
  await assert.rejects(app.as(bob).call('staffOnly', {}), { code: 'T3101' })
  await assert.rejects(app.as('no-such-user').call('whoAmI', {}), { code: 'T2103' })

  // The two that have a word.
  assert.equal(await app.as('nobody').call('whoAmI', {}), 'no user')
  await assert.rejects(app.as('nobody').call('staffOnly', {}), { code: 'T0006' })
  assert.equal(await app.as('system').call('staffOnly', {}), 'no user')

  // The rules of the tables hold for a test caller: an order is read by its owner alone.
  const mine = await app.as(bob).call('openOrders', { limit: 5 })
  assert.deepEqual(
    (Array.isArray(mine) ? mine : []).map((one) => one.title),
    ['A lamp', 'A desk'],
  )
  assert.deepEqual(await app.as(maya).call('openOrders', { limit: 5 }), [])
  const [lamp] = Array.isArray(mine) ? mine : []
  await assert.rejects(app.as(bob).call('markPaid', { order: lamp.id }), { code: 'T3101' })
  await app.as(maya).call('markPaid', { order: lamp.id })

  // `rows` reads with full access, whoever owns a row.
  const orders = await app.rows('orders')
  assert.deepEqual(orders.map((one) => [one.title, one.paid]).sort(), [
    ['A chair', true],
    ['A desk', false],
    ['A lamp', true],
  ])
  await assert.rejects(app.rows('nothing'), (error: unknown) =>
    /^T\d{4}$/.test(String(Reflect.get(Object(error), 'code'))),
  )

  // A value is handed as code holds it: a moment is a `Date`, into a function and out of it.
  assert.equal(await app.as('nobody').call('yearOf', { at: new Date(Date.UTC(2031, 5, 1)) }), 2031)
  assert.equal((await app.as('nobody').call('moment', {})) instanceof Date, true)

  // A call that fails refuses its promise with the error itself, whose code a test reads.
  await assert.rejects(app.as(maya).call('addOrder', { title: '' }), { code: 'T0002' })
  await assert.rejects(app.as(maya).call('noSuchFunction', {}), { code: 'T0001' })
})

test('[16-2@4] T0014: a user is needed, and the app has no `users` table', async (t) => {
  const { app } = await opened(t, 'bare')
  // An app with no seed opens, and holds nothing.
  assert.deepEqual(await app.rows('things'), [])
  await assert.rejects(app.user({ name: 'Maya' }), { code: 'T0014' })
  await assert.rejects(app.as('some-id').call('anything', {}), { code: 'T0014' })
})

test('[17-2] `back` puts every table back as it was at the mark, after rows were added, changed and removed', async (t) => {
  const { app } = await opened(t, 'shop')
  const staff = await app.user({ name: 'Maya', roles: ['staff'] })
  const tables = async (): Promise<Record<string, unknown>> => ({
    users: await app.rows('users'),
    orders: await app.rows('orders'),
  })
  const atMark = await tables()
  const mark = await app.mark()

  const lamp = String((await app.rows('orders')).find((row) => row.title === 'A lamp')?.id)
  const desk = String((await app.rows('orders')).find((row) => row.title === 'A desk')?.id)
  await app.as(staff).call('addOrder', { title: 'A shelf' })
  await app.user({ name: 'Cy', roles: [] })
  await app.as(staff).call('markPaid', { order: lamp })
  await app.as(staff).call('dropOrder', { order: desk })
  const changed = await tables()
  assert.notDeepEqual(changed, atMark)
  const later = await app.mark()

  await app.back(mark)
  assert.deepEqual(await tables(), atMark)

  // The app works on from the mark, and a mark is taken back to as often as a test asks.
  await app.as(staff).call('addOrder', { title: 'A stool' })
  assert.equal((await app.rows('orders')).length, 4)
  await app.back(mark)
  assert.deepEqual(await tables(), atMark)
  await app.back(later)
  assert.deepEqual(await tables(), changed)
})

test('[17-3] a request from the web cannot be a test caller: no header and no field of a request names one', async (t) => {
  const { app } = await opened(t, 'shop')
  const maya = await app.user({ name: 'Maya', roles: ['staff'] })
  const id = String(maya.user?.id)
  // In the program of the test the function tells its caller, so it would tell one that a request had named.
  assert.equal(await app.as(maya).call('whoAmI', {}), id)
  assert.equal(await app.as(maya).call('staffOnly', {}), id)

  const named = JSON.stringify(maya)
  const headers: Record<string, string>[] = [
    {},
    { 'x-tent-caller': named },
    { 'x-tent-as': id },
    { 'x-tent-user': id },
    { 'x-tent-test': 'system' },
    { 'tent-caller': named },
    { 'tent-caller': 'system' },
    { as: id },
    { caller: named },
    { authorization: `Bearer ${id}` },
    { authorization: 'Bearer system' },
    { cookie: `tent=${id}; as=${id}; caller=system` },
  ]
  for (const one of headers) {
    assert.deepEqual(await sent(app, 'whoAmI', { headers: one }), { status: 200, value: 'no user', code: undefined })
    assert.equal((await sent(app, 'staffOnly', { headers: one })).code, 'T0006', JSON.stringify(one))
  }

  // The one field of a call that names a user is the one a page sends, and it names no caller: a page drawn for
  // a user, sent by nobody, is told that its caller changed, and a field that names no user is nothing.
  for (const as of [id, 'system', maya]) {
    const drawn = typeof as === 'string'
    assert.equal((await sent(app, 'whoAmI', { fields: { as } })).value, drawn ? undefined : 'no user')
    assert.equal((await sent(app, 'staffOnly', { fields: { as } })).code, drawn ? 'T3101' : 'T0006')
  }
  // Any other field is refused before the function is found to run.
  for (const field of ['caller', 'user', 'system', 'test'])
    for (const name of ['whoAmI', 'staffOnly']) {
      const answered = await sent(app, name, { fields: { [field]: maya } })
      assert.deepEqual([answered.status, answered.code], [400, 'T0002'], field)
    }
  // And the address of a call names a function and nothing more.
  assert.notEqual((await sent(app, `staffOnly?as=${id}&caller=system`)).value, id)
})

test('[17-1] the clock of a test app: `advance` moves the time of the app, and what stands on its timers', async (t) => {
  const { app } = await opened(t, 'shop')
  const momentOf = async (): Promise<number> => {
    const at = await app.as('nobody').call('moment', {})
    return at instanceof Date ? at.getTime() : Number.NaN
  }
  const start = await momentOf()
  assert.equal(Math.abs(start - Date.now()) < 60_000, true)
  app.clock.advance('3 days')
  const moved = (await momentOf()) - start
  assert.equal(moved >= 3 * day && moved < 3 * day + 60_000, true, String(moved))

  // A row is written at the moved time.
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.as(maya).call('addOrder', { title: 'A shelf' })
  const shelf = (await app.rows('orders')).find((row) => row.title === 'A shelf')
  const written = shelf?.createdAt instanceof Date ? shelf.createdAt.getTime() : Number.NaN
  assert.equal(written - start >= 3 * day, true)

  // The counts of a minute stand on a timer of the clock: a visitor who used theirs up is taken again a minute on.
  const from = '10.9.9.9'
  for (let i = 0; i < 5; i++) assert.equal((await sent(app, 'whoAmI', { from })).status, 200)
  assert.equal((await sent(app, 'whoAmI', { from })).code, 'T0005')
  app.clock.advance('1 minute')
  assert.equal((await sent(app, 'whoAmI', { from })).status, 200)

  assert.throws(() => app.clock.advance('soon'), { code: 'T0027' })
  // The time never goes back.
  assert.throws(() => app.clock.advance('-1 days'), { code: 'T0027' })
})
