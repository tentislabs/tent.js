import assert from 'node:assert/strict'
import { createHmac, generateKeyPairSync, sign } from 'node:crypto'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const formKey = Buffer.from('a key of the forms that is long enough').toString('base64')
const pair = generateKeyPairSync('ed25519')
// The raw 32 bytes of the public key, as a provider of the standard gives them after `whpk_`.
const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')

const secrets = {
  STRIPE_HOOK: 'whsec_stripe_secret_of_the_test',
  FORMS_HOOK: `whsec_${formKey}`,
  FORMS_KEY: `whpk_${publicKey}`,
  GITHUB_HOOK: 'the secret of github hooks',
  BUILD_HOOK: 'the secret of the builds',
  PARTNER_KEY: 'the key of the partner',
}

/** The project of the calls coming in, as a test app with the secrets of the test. */
async function hooked(t: TestContext): Promise<TestApp> {
  const app = await testApp({ folder: copyOf(t, 'hooked'), secrets })
  closing(t, () => app.close())
  return app
}

/** Posts a call coming in to an address of the app, from an address of the web, and answers the response. */
const post = (
  app: TestApp,
  path: string,
  body: string | Uint8Array<ArrayBuffer>,
  headers: Record<string, string>,
  from = '203.0.113.7',
) => app.request(new Request(`http://localhost${path}`, { method: 'POST', headers, body }), { from })

/** What each run of a flow of a call coming in noted, by its hook. */
async function noted(app: TestApp, hook?: string): Promise<Record<string, unknown>[]> {
  const rows = await app.rows('events')
  return rows.filter((one) => hook === undefined || one.hook === hook).map((one) => Object(one.event))
}

const hmac = (key: string | Buffer, text: string | Buffer, encoding: 'hex' | 'base64') =>
  createHmac('sha256', key).update(text).digest(encoding)

/** The lines of a call that the standard signs with a key of HMAC. */
function standard(body: string, o: { id?: string; at?: number; key?: Buffer } = {}): Record<string, string> {
  const id = o.id ?? 'msg_1'
  const at = String(o.at ?? Math.floor(Date.now() / 1000))
  const signature = hmac(o.key ?? Buffer.from(formKey, 'base64'), `${id}.${at}.${body}`, 'base64')
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': at,
    'webhook-signature': `v1,${signature}`,
  }
}

/** The lines of a call that Stripe signs. */
function stripeLines(body: string, at = Math.floor(Date.now() / 1000)): Record<string, string> {
  return {
    'content-type': 'application/json',
    'stripe-signature': `t=${at},v1=${hmac(secrets.STRIPE_HOOK, `${at}.${body}`, 'hex')}`,
  }
}

/** One byte of a text changed. */
const changed = (text: string): string => `${text.slice(0, -2)}${text.at(-2) === '1' ? '2' : '1'}${text.at(-1)}`

/** Waits until the runs that the calls started have noted what they were handed. */
async function settledNotes(app: TestApp, count: number, hook?: string): Promise<Record<string, unknown>[]> {
  const ends = performance.now() + 10_000
  for (;;) {
    const rows = await noted(app, hook)
    if (rows.length >= count) return rows
    assert.ok(performance.now() < ends, `${rows.length} of ${count} runs noted what they were handed`)
    await new Promise((done) => setTimeout(done, 10))
  }
}

test('[24-7] each scheme passes a stored example in the form its service sends, and fails with one byte of the body changed', async (t) => {
  const app = await hooked(t)
  const at = Math.floor(Date.now() / 1000)
  const stripeBody = '{"id":"evt_1","type":"charge.succeeded","amount":2000}'
  const formBody = '{"form":"contact","name":"Ada"}'
  const githubBody = '{"action":"opened","number":1}'
  const buildBody = '{"build":41,"state":"passed"}'
  const signed = sign(null, Buffer.from(`msg_9.${at}.${formBody}`), pair.privateKey).toString('base64')
  const cases: [string, string, Record<string, string>][] = [
    ['/hooks/stripe', stripeBody, stripeLines(stripeBody, at)],
    ['/hooks/forms', formBody, standard(formBody, { at })],
    [
      '/hooks/keyed',
      formBody,
      {
        'content-type': 'application/json',
        'webhook-id': 'msg_9',
        'webhook-timestamp': String(at),
        'webhook-signature': `v1a,${signed}`,
      },
    ],
    [
      '/hooks/github',
      githubBody,
      {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${hmac(secrets.GITHUB_HOOK, githubBody, 'hex')}`,
        'x-github-delivery': 'delivery-1',
      },
    ],
    [
      '/hooks/builds',
      buildBody,
      {
        'content-type': 'application/json',
        'x-signature': `sha256=${hmac(secrets.BUILD_HOOK, buildBody, 'hex')}`,
        'x-delivery': 'b-1',
      },
    ],
  ]
  for (const [path, body, headers] of cases) {
    const wrong = await post(app, path, changed(body), headers)
    assert.equal(wrong.status, 401, `${path} with one byte changed`)
    assert.equal((await wrong.json()).error.code, 'T7118')
    const right = await post(app, path, body, headers)
    assert.equal(right.status, 200, path)
    assert.deepEqual(await right.json(), { ok: true })
  }
  const rows = await settledNotes(app, 5)
  assert.equal(rows.length, 5)
})

test('[24-7] with a whpk_ secret, a v1 entry made with that text as its key does not pass, and a time six minutes old is T7118', async (t) => {
  const app = await hooked(t)
  const body = '{"form":"contact"}'
  const at = Math.floor(Date.now() / 1000)
  const asKey = hmac(secrets.FORMS_KEY, `msg_1.${at}.${body}`, 'base64')
  const lines = {
    'content-type': 'application/json',
    'webhook-id': 'msg_1',
    'webhook-timestamp': String(at),
    'webhook-signature': `v1,${asKey}`,
  }
  assert.equal((await post(app, '/hooks/keyed', body, lines)).status, 401)
  const old = at - 6 * 60
  assert.equal((await post(app, '/hooks/forms', body, standard(body, { at: old }))).status, 401)
  assert.equal((await post(app, '/hooks/stripe', body, stripeLines(body, old))).status, 401)
  assert.deepEqual(await noted(app), [])
})

test('[24-7] [24-19] a repeat is answered 200 and starts no second run, also when the program was killed between the two', async (t) => {
  const app = await hooked(t)
  const body = '{"id":"evt_7","type":"charge.refunded"}'
  assert.equal((await post(app, '/hooks/stripe', body, stripeLines(body))).status, 200)
  assert.equal((await post(app, '/hooks/stripe', body, stripeLines(body))).status, 200)
  await settledNotes(app, 1, 'stripeReceived')
  await app.kill()
  await app.restart()
  const again = await post(app, '/hooks/stripe', body, stripeLines(body))
  assert.equal(again.status, 200)
  assert.deepEqual(await again.json(), { ok: true })
  await new Promise((done) => setTimeout(done, 300))
  assert.equal((await noted(app, 'stripeReceived')).length, 1)
})

test('[24-7] a call with `open` starts its flow, which is handed the body, the headers without the signature, the values of its path and what stood after the question mark', async (t) => {
  const app = await hooked(t)
  const opened = await post(app, '/hooks/open?shop=north', '{"hello":"world"}', {
    'content-type': 'application/json',
    authorization: 'Bearer secret-of-nobody',
    cookie: 'a=b',
    'x-extra': 'kept',
  })
  assert.equal(opened.status, 200)
  const [event] = await settledNotes(app, 1, 'openReceived')
  assert.equal(event.kind, 'incoming')
  assert.deepEqual(event.body, { hello: 'world' })
  assert.deepEqual(event.query, { shop: 'north' })
  const headers = Object(event.headers)
  assert.equal(headers['x-extra'], 'kept')
  assert.equal(headers.authorization, undefined)
  assert.equal(headers.cookie, undefined)
  // The header of the signature is taken out too.
  const githubBody = '{"a":1}'
  await post(app, '/hooks/github', githubBody, {
    'content-type': 'application/json',
    'x-hub-signature-256': `sha256=${hmac(secrets.GITHUB_HOOK, githubBody, 'hex')}`,
    'x-github-delivery': 'd-2',
  })
  const [github] = await settledNotes(app, 1, 'githubReceived')
  assert.equal(Object(github.headers)['x-hub-signature-256'], undefined)
  assert.equal(github.id, 'd-2')
  // A body that says it is no JSON is handed as the text that arrived.
  await post(app, '/hooks/open', 'plain words', { 'content-type': 'text/plain' })
  const rows = await settledNotes(app, 2, 'openReceived')
  assert.ok(rows.some((one) => one.body === 'plain words'))
})

test('[24-7] a scheme `{ by }` is asked, the id it answers keeps a repeat from starting a second run, and a path with a value hands the flow `params`', async (t) => {
  const app = await hooked(t)
  const lines = { 'content-type': 'application/json', 'x-partner-key': secrets.PARTNER_KEY, 'x-partner-id': 'p-1' }
  assert.equal((await post(app, '/hooks/partner/north', '{"n":1}', { ...lines, 'x-partner-key': 'wrong' })).status, 401)
  assert.equal((await post(app, '/hooks/partner/north', '{"n":1}', lines)).status, 200)
  assert.equal((await post(app, '/hooks/partner/north', '{"n":1}', lines)).status, 200)
  const [event] = await settledNotes(app, 1, 'partnerReceived')
  assert.deepEqual(event.params, { shop: 'north' })
  assert.equal(event.id, 'p-1')
  await new Promise((done) => setTimeout(done, 300))
  assert.equal((await noted(app, 'partnerReceived')).length, 1)
})

test('[24-7] an `incoming` with `limits: { size }` takes a body over `callSize`, and another is refused it', async (t) => {
  const app = await hooked(t)
  const large = JSON.stringify({ words: 'x'.repeat(2 * 1_048_576) })
  assert.equal((await post(app, '/hooks/big', large, { 'content-type': 'application/json' })).status, 200)
  assert.equal((await post(app, '/hooks/open', large, { 'content-type': 'application/json' })).status, 413)
})

test('[24-7] the 6,001st call of a minute from one address is T0005', async (t) => {
  const app = await hooked(t)
  const body = '{"form":"x"}'
  const wrong = { ...standard(body), 'webhook-signature': 'v1,AAAA' }
  // The count is of the minute that runs: the calls start just after a minute began, so all fall in it.
  app.clock.advance(`${60_000 - (Date.now() % 60_000) + 1000} ms`)
  // Sent fifty at a time, so that the six thousand take seconds and not the minute.
  for (let n = 0; n < 6000; n += 50) {
    const answers = await Promise.all(
      Array.from({ length: 50 }, () => post(app, '/hooks/forms', body, wrong, '198.51.100.9')),
    )
    assert.deepEqual(new Set(answers.map((one) => one.status)), new Set([401]), `calls ${n + 1} to ${n + 50}`)
  }
  const over = await post(app, '/hooks/forms', body, standard(body), '198.51.100.9')
  assert.equal(over.status, 429)
  assert.equal((await over.json()).error.code, 'T0005')
  // Another address is counted apart.
  assert.equal((await post(app, '/hooks/forms', body, standard(body), '198.51.100.10')).status, 200)
})

test('[24-8] `verified` in a route answers the id and the bytes for a right signature, after the route read the body, and T7118 for a wrong one; a `get` route and an `incoming` share a path', async (t) => {
  const app = await hooked(t)
  const body = '{"zen":"Keep it logically awesome."}'
  const lines = {
    'content-type': 'application/json',
    'x-hub-signature-256': `sha256=${hmac(secrets.GITHUB_HOOK, body, 'hex')}`,
    'x-github-delivery': 'route-1',
  }
  const right = await post(app, '/exchange', body, lines)
  assert.deepEqual(await right.json(), { id: 'route-1', body, read: body })
  const wrong = await post(app, '/exchange', changed(body), lines)
  assert.deepEqual([wrong.status, await wrong.json()], [401, { code: 'T7118' }])
  const asked = await app.request(new Request('http://localhost/hooks/stripe'))
  assert.equal(await asked.text(), 'here')
})

test('[24-19] an incoming call with a wrong signature, an old timestamp or a repeated id is refused or ignored as stated', async (t) => {
  const app = await hooked(t)
  const body = '{"form":"contact"}'
  assert.equal(
    (await post(app, '/hooks/forms', body, { ...standard(body), 'webhook-signature': 'v1,AAAA' })).status,
    401,
  )
  assert.equal(
    (await post(app, '/hooks/forms', body, standard(body, { at: Math.floor(Date.now() / 1000) - 600 }))).status,
    401,
  )
  const lines = standard(body, { id: 'msg_repeat' })
  assert.equal((await post(app, '/hooks/forms', body, lines)).status, 200)
  assert.equal((await post(app, '/hooks/forms', body, lines)).status, 200)
  await settledNotes(app, 1, 'formReceived')
  await new Promise((done) => setTimeout(done, 300))
  assert.equal((await noted(app, 'formReceived')).length, 1)
})
