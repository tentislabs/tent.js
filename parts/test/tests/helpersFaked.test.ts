import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { keyedApp } from './keyedApp.ts'

test('[24-16] in a test app a service that was not faked fails its calls with T7115, naming `app.fake`, and reaches nothing; `app.fake` answers and keeps what it was sent', async (t) => {
  const app = await keyedApp(t)
  await assert.rejects(app.as('system').call('forecast', { city: 'Oslo' }), (error: unknown) => {
    assert.equal(Object(error).code, 'T7115')
    assert.match(String(Object(error).message), /app\.fake/)
    return true
  })
  const fake = app.fake('weather', { today: ({ city }: { city: string }) => ({ temp: city.length }) })
  assert.deepEqual(await app.as('system').call('forecast', { city: 'Oslo' }), { temp: 4 })
  assert.deepEqual(
    fake.sent.map((one) => [one.call, one.input]),
    [['today', { city: 'Oslo' }]],
  )
  assert.deepEqual(
    app.fake('weather').sent.map((one) => one.call),
    ['today'],
  )
})

test('[24-16] a faked service with `oauth` still needs a connection, which `app.connection` makes', async (t) => {
  const app = await keyedApp(t)
  app.fake('github', { listIssues: [{ title: 'one' }] })
  const maya = await app.user({ name: 'Maya', roles: [] })
  await assert.rejects(app.as(maya).call('issues', {}), { code: 'T7117' })
  await app.connection(maya, 'github')
  assert.deepEqual(await app.as(maya).call('issues', {}), [{ title: 'one' }])
})

test('[24-16] `app.incoming` sends a signed call, and one that is not signed is refused', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'hooked') })
  closing(t, () => app.close())
  const signed = await app.incoming('formEvents', { body: { form: 'contact' } })
  assert.equal(signed.status, 200)
  const unsigned = await app.incoming('formEvents', { body: { form: 'contact' }, sign: false })
  assert.equal(unsigned.status, 401)
  for (let i = 0; i < 300 && !(await app.rows('events')).length; i++) await new Promise((done) => setTimeout(done, 10))
  assert.equal((await app.rows('events')).length, 1)
})

test('[24-16] `app.key` makes a key, and answers a caller for `app.as` and `key` for a request', async (t) => {
  const app = await keyedApp(t)
  const { caller, key } = await app.key({ scopes: ['myOrders'], roles: [] })
  assert.deepEqual(await app.as(caller).call('myOrders', {}), [])
  const answer = await app.request(
    new Request('http://localhost/api/myOrders', { headers: { authorization: `Bearer ${key}` } }),
  )
  assert.equal(answer.status, 200)
})

test('[24-16] `app.cli` runs a command and answers what it printed and how it ended', async (t) => {
  const app = await keyedApp(t)
  const maya = await app.user({ name: 'Maya', roles: [] })
  const ran = await app.cli(['who-calls'], { as: String(maya.user?.id) })
  assert.deepEqual([ran.code, ran.out.trim(), ran.err], [0, String(maya.user?.id), ''])
  const unknown = await app.cli(['no-such-command'])
  assert.equal(unknown.code, 2)
  assert.match(unknown.err, /no command/)
})
