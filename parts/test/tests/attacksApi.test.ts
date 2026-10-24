import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { api, called, keyOf, sent } from './keyedApp.ts'
import { notDropped } from './started.ts'

// Definitions of the attacks, beside those of the project of the keys.
const more = `
export const ledger = table('ledger', {
  columns: { title: text(), note: text({ optional: true, private: true }) },
  access: { read: 'anyone' },
})

export const allLedger = query('allLedger', {
  access: 'signedIn',
  system: 'reads every row of the ledger',
  input: {},
  output: list(object({ title: text(), note: text({ optional: true }) })),
  run: ({ db }) => db.system.ledger.all().map((one) => ({ title: one.title, note: one.note })),
})

// A flow with full access, offered to the API: its answer is filtered by its output.
export const ledgerFlow = flow('ledgerFlow', {
  access: 'signedIn',
  about: 'The titles of the ledger',
  offer: ['api'],
  system: 'reads the ledger of every caller',
  input: {},
  output: list(object({ title: text() })),
  run: async ({ step }) => step('read', () => allLedger({})),
})

export const longFlow = flow('longFlow', {
  about: 'Waits an hour',
  access: 'signedIn',
  offer: ['api'],
  as: 'starter',
  input: {},
  output: text(),
  run: async ({ step }) => {
    await step.wait('1 hour')
    return 'done'
  },
})

// A change with no input that writes: a form of another site must not set it off.
export const touchLedger = change('touchLedger', {
  about: 'Writes a row with no input',
  access: 'signedIn',
  offer: ['api'],
  system: 'writes the ledger for the test',
  input: {},
  run: ({ db }) => void db.system.ledger.add({ title: 'touched' }),
})

export const addLedger = change('addLedger', {
  access: anyone('a test fills the ledger'),
  system: 'writes the ledger for the test',
  input: { title: text(), note: text() },
  run: ({ input, db }) => void db.system.ledger.add(input),
})
`

async function attackedApp(t: TestContext): Promise<TestApp> {
  const folder = copyOf(t, 'keyed')
  appendFileSync(join(folder, 'functions.ts'), more)
  const app = await testApp({
    folder,
    secrets: { GITHUB_ID: 'the id of the app', GITHUB_SECRET: 'the secret of the app' },
  })
  closing(t, () => app.close())
  return app
}

test("[05-11.19] a page of another site that calls the API with the visitor's cookie, a read among the calls, and that asks first for a site that is not listed: T0004, and the question is answered 403 with no site named", async (t) => {
  const app = await attackedApp(t)
  const maya = await app.user({ name: 'Maya', roles: [] })
  const browser = app.browser({ as: maya })
  const evil = { origin: 'https://evil.example' }
  for (const [method, path, body] of [
    ['GET', '/api/myOrders', undefined],
    ['POST', '/api/myOrders', '{}'],
    ['POST', '/api/addOrder', '{"title":"by evil"}'],
  ] as const) {
    const answer = await browser.request(method, path, {
      headers: { ...evil, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body } : {}),
    })
    assert.equal(answer.status, 403, `${method} ${path}`)
    assert.equal(Object(await answer.json()).code, 'T0004')
    assert.equal(answer.headers.get('access-control-allow-origin'), null)
  }
  const question = await sent(app, 'OPTIONS', '/api/myOrders', {
    headers: { ...evil, 'access-control-request-method': 'POST' },
  })
  assert.equal(question.status, 403)
  for (const [name, value] of question.headers) assert.doesNotMatch(`${name}: ${value}`, /evil\.example/)
  assert.equal(question.headers.get('access-control-allow-origin'), null)
  assert.deepEqual(await app.rows('orders'), [])
})

test('[05-11.43] an empty `POST` to the address of a change with no input, from a form on another site, is T0004', async (t) => {
  const app = await attackedApp(t)
  const maya = await app.user({ name: 'Maya', roles: [] })
  const browser = app.browser({ as: maya })
  for (const path of ['/api/touchLedger', '/_t/call/touchLedger']) {
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
      const answer = await browser.request('POST', path, {
        headers: { origin: 'https://evil.example', 'content-type': type },
        body: '',
      })
      const said = await answer.text()
      // At /_t/call/ a body that is no JSON reaches no call at all, which holds the attack too.
      if (path.startsWith('/api/') || answer.status !== 404) {
        assert.equal(answer.status, 403, `${path} as ${type}: ${said}`)
        assert.match(said, /T0004/)
      }
    }
  }
  assert.deepEqual(await app.rows('ledger'), [])
})

test('[05-11.45] a program with a key that is answered T7120 sends the call to `/_t/call/` and to `/api/`: T7120 there too, unless the key states `asks: none`', async (t) => {
  const app = await attackedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  const atApi = await api(app, 'POST', 'refundAll', { key, input: { reason: 'r' } })
  assert.equal(Object(atApi.body).code, 'T7120')
  assert.equal(Object((await called(app, 'refundAll', { reason: 'r' }, key)).error).code, 'T7120')
  const quiet = await keyOf(app, { scopes: ['*'], asks: 'none' })
  assert.equal((await api(app, 'POST', 'refundAll', { key: quiet.key, input: { reason: 'r' } })).body, 'refunded for r')
  assert.equal((await called(app, 'refundAll', { reason: 'r' }, quiet.key)).ok, true)
})

test('[05-11.46] a text of T7120 sent back with another input, by another key, and a second time: the function does not run', async (t) => {
  const app = await attackedApp(t)
  const one = await keyOf(app, { scopes: ['*'] })
  const two = await keyOf(app, { scopes: ['*'] })
  const asked = await api(app, 'POST', 'refundAll', { key: one.key, input: { reason: 'r' } })
  const text = String(Object(Object(asked.body).fields).ask)
  assert.ok(text.length > 10)
  const yes = (key: string, reason: string) =>
    api(app, 'POST', 'refundAll', { key, input: { reason }, headers: { 'tent-agreed': text } })
  assert.equal(Object((await yes(one.key, 'other')).body).code, 'T7120', 'another input')
  assert.equal(Object((await yes(two.key, 'r')).body).code, 'T7120', 'another key')
  assert.equal((await yes(one.key, 'r')).body, 'refunded for r')
  assert.equal(Object((await yes(one.key, 'r')).body).code, 'T7120', 'a second time')
  const atCall = await sent(app, 'POST', '/_t/call/refundAll', {
    key: one.key,
    headers: { 'content-type': 'application/json', 'tent-agreed': text },
    body: JSON.stringify({ input: { reason: 'r' } }),
  })
  assert.equal(Object(Object(await atCall.json()).error).code, 'T7120', 'a used text at another door')
})

test('[05-4.22] an offered flow with full access, called by a caller who passes its `access`, answers what its `output` names and no `private` column', async (t) => {
  const app = await attackedApp(t)
  await app.as('system').call('addLedger', { title: 'rent', note: 'the private words' })
  const { key } = await keyOf(app, { scopes: ['ledgerFlow'] })
  const answer = await api(app, 'POST', 'ledgerFlow', { key, input: {} })
  assert.equal(answer.status, 200, JSON.stringify(answer.body))
  assert.deepEqual(answer.body, [{ title: 'rent' }])
  assert.doesNotMatch(JSON.stringify(answer.body), /private words/)
})

test('[05-8.26@8a] `{ run }` and `{ run, stop: true }` sent to a flow that is offered to the API, by another caller than its starter: T0001', async (t) => {
  const app = await attackedApp(t)
  const one = await keyOf(app, { scopes: ['*'] })
  const two = await keyOf(app, { scopes: ['*'] })
  const { run } = notDropped(
    await app.start('longFlow', {}, { as: { kind: 'key', key: { id: one.id, scopes: ['*'], roles: [] } } }),
  )
  for (let i = 0; i < 500 && app.runs.read(run)?.state !== 'waiting'; i++)
    await new Promise((done) => setTimeout(done, 10))
  const wait = await api(app, 'POST', 'longFlow', { key: two.key, input: { run } })
  assert.equal(wait.status, 404)
  assert.equal(Object(wait.body).code, 'T0001')
  const stop = await api(app, 'POST', 'longFlow', { key: two.key, input: { run, stop: true } })
  assert.equal(stop.status, 404)
  assert.equal(Object(stop.body).code, 'T0001')
  assert.equal(app.runs.read(run)?.state, 'waiting', 'the run of the other key goes on')
})

test('[05-12.14] `/_t/cli` as nobody is T0006 where `describeTo` does not open it, and `/_t/cli/me` answers an empty record', async (t) => {
  const app = await attackedApp(t)
  const listed = await sent(app, 'GET', '/_t/cli')
  assert.equal(listed.status, 401)
  const read = Object(await listed.json())
  assert.equal(Object(read.error).code, 'T0006')
  assert.doesNotMatch(JSON.stringify(read), /whoCalls|who-calls/)
  const me = await sent(app, 'GET', '/_t/cli/me')
  assert.equal(me.status, 200)
  assert.deepEqual(Object(await me.json()).value, {})
  const { key } = await keyOf(app, { scopes: ['myOrders'] })
  assert.equal((await sent(app, 'GET', '/_t/cli', { key })).status, 200, 'a key reads it, as every signed-in caller')
})
