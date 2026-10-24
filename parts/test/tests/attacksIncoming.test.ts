import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const formKey = Buffer.from('a key of the forms that is long enough').toString('base64')
const publicKey = Buffer.alloc(32, 7).toString('base64')

const secrets = {
  STRIPE_HOOK: 'whsec_stripe_secret_of_the_test',
  FORMS_HOOK: `whsec_${formKey}`,
  FORMS_KEY: `whpk_${publicKey}`,
  GITHUB_HOOK: 'the secret of github hooks',
  BUILD_HOOK: 'the secret of the builds',
  PARTNER_KEY: 'the key of the partner',
}

async function hooked(t: TestContext): Promise<TestApp> {
  const app = await testApp({ folder: copyOf(t, 'hooked'), secrets })
  closing(t, () => app.close())
  return app
}

const post = (
  app: TestApp,
  path: string,
  body: string | Uint8Array<ArrayBuffer>,
  headers: Record<string, string>,
  from = '203.0.113.7',
) => app.request(new Request(`http://localhost${path}`, { method: 'POST', headers, body }), { from })

const hmac = (key: string | Buffer, text: string | Buffer, encoding: 'hex' | 'base64') =>
  createHmac('sha256', key).update(text).digest(encoding)

const nowIn = (app: TestApp): number => Math.floor((Date.now() + aheadOf(app)) / 1000)

// The clock of a test app runs ahead of the system's by what a test moved it, which a signer must sign with.
const aheads = new WeakMap<TestApp, number>()
const aheadOf = (app: TestApp): number => aheads.get(app) ?? 0
const advance = (app: TestApp, length: string, ms: number): void => {
  app.clock.advance(length)
  aheads.set(app, aheadOf(app) + ms)
}

function standard(body: string, o: { id?: string; at: number; key?: Buffer | string }): Record<string, string> {
  const id = o.id ?? 'msg_1'
  const signature = hmac(o.key ?? Buffer.from(formKey, 'base64'), `${id}.${o.at}.${body}`, 'base64')
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(o.at),
    'webhook-signature': `v1,${signature}`,
  }
}

const stripeLines = (body: string, at: number, secret = secrets.STRIPE_HOOK): Record<string, string> => ({
  'content-type': 'application/json',
  'stripe-signature': `t=${at},v1=${hmac(secret, `${at}.${body}`, 'hex')}`,
})

const githubLines = (body: string, id: string, secret = secrets.GITHUB_HOOK): Record<string, string> => ({
  'content-type': 'application/json',
  'x-hub-signature-256': `sha256=${hmac(secret, body, 'hex')}`,
  'x-github-delivery': id,
})

const notes = async (app: TestApp, hook: string): Promise<number> =>
  (await app.rows('events')).filter((one) => one.hook === hook).length

/** Waits for the runs that were started to note, and a little more, so that a second run would have shown. */
async function settled(app: TestApp, hook: string, count: number): Promise<number> {
  for (let i = 0; i < 500 && (await notes(app, hook)) < count; i++) await new Promise((done) => setTimeout(done, 10))
  await new Promise((done) => setTimeout(done, 300))
  return notes(app, hook)
}

const codeOf = async (answer: Response): Promise<unknown> => Object(Object(await answer.json()).error).code

test('[05-11.11] a call coming in with no signature, with another secret, with one byte changed, and six minutes off in either direction is T7118, and no run', async (t) => {
  const app = await hooked(t)
  const body = '{"id":"evt_1","amount":2000}'
  const at = nowIn(app)
  const cases: [string, Record<string, string>, string][] = [
    ['no signature', { 'content-type': 'application/json' }, body],
    ['another secret', stripeLines(body, at, 'whsec_another'), body],
    ['one byte changed', stripeLines(body, at), body.replace('2000', '2001')],
    ['six minutes old', stripeLines(body, at - 360), body],
    ['six minutes ahead', stripeLines(body, at + 360), body],
  ]
  for (const [what, headers, sentBody] of cases) {
    const answer = await post(app, '/hooks/stripe', sentBody, headers)
    assert.equal(answer.status, 401, what)
    assert.equal(await codeOf(answer), 'T7118', what)
  }
  for (const [what, headers] of [
    ['standard, six minutes old', standard(body, { at: at - 360 })],
    ['standard, six minutes ahead', standard(body, { at: at + 360 })],
    ['standard, another secret', standard(body, { at, key: Buffer.from('another key') })],
  ] as const) {
    const answer = await post(app, '/hooks/forms', body, headers)
    assert.equal(await codeOf(answer), 'T7118', what)
  }
  assert.equal(await settled(app, 'stripeReceived', 0), 0)
  assert.equal(await settled(app, 'formReceived', 0), 0)
})

test('[05-11.12] one signed call sent a thousand times at once starts one run', async (t) => {
  const app = await hooked(t)
  const body = '{"id":"evt_many","amount":1}'
  const headers = stripeLines(body, nowIn(app))
  const answers = await Promise.all(Array.from({ length: 1000 }, () => post(app, '/hooks/stripe', body, headers)))
  assert.deepEqual([...new Set(answers.map((one) => one.status))], [200])
  assert.equal(await settled(app, 'stripeReceived', 1), 1)
})

test('[05-11.13] a call coming in of 2 MB is T0003, and seven thousand a minute from one address are T0005', async (t) => {
  const app = await hooked(t)
  const big = JSON.stringify({ id: 'evt_big', pad: 'x'.repeat(2 * 1024 * 1024) })
  const tooBig = await post(app, '/hooks/stripe', big, stripeLines(big, nowIn(app)))
  assert.equal(tooBig.status, 413)
  assert.equal(await codeOf(tooBig), 'T0003')
  // Just after the start of a minute, so that every call is counted in one.
  const into = 60_000 - ((Date.now() + aheadOf(app)) % 60_000) + 50
  advance(app, `${into} ms`, into)
  const statuses: number[] = []
  for (let n = 0; n < 7000; n += 100) {
    const batch = await Promise.all(
      Array.from({ length: 100 }, () =>
        post(app, '/hooks/open', '{}', { 'content-type': 'application/json' }, '198.51.100.9'),
      ),
    )
    statuses.push(...batch.map((one) => one.status))
  }
  assert.equal(statuses.filter((one) => one === 200).length, 6000)
  assert.equal(statuses.filter((one) => one === 429).length, 1000)
})

test('[05-11.14] a signature that differs in its last character takes the time of one that differs in its first', async (t) => {
  const app = await hooked(t)
  const body = '{"action":"opened"}'
  const right = hmac(secrets.GITHUB_HOOK, body, 'hex')
  const flip = (text: string, at: number): string =>
    text.slice(0, at) + (text[at] === '0' ? '1' : '0') + text.slice(at + 1)
  const timed = async (signature: string): Promise<number> => {
    const began = performance.now()
    for (let n = 0; n < 300; n++)
      await post(app, '/hooks/github', body, {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-delivery': `d-${n}`,
      })
    return performance.now() - began
  }
  await timed(flip(right, 0))
  const [first, last] = [await timed(flip(right, 0)), await timed(flip(right, right.length - 1))]
  assert.ok(Math.max(first, last) / Math.min(first, last) < 2, `the first took ${first} ms and the last ${last} ms`)
  assert.equal(await settled(app, 'githubReceived', 0), 0)
})

test('[05-11.23] a route that hands its request to `verified` after reading the body is checked over the bytes that arrived', async (t) => {
  const app = await hooked(t)
  // A body that is the same text but other bytes once it is read and written again.
  const bytes = new Uint8Array(Buffer.from('{"a": 1,   "b":"é"}', 'utf8'))
  const headers = githubLines(Buffer.from(bytes).toString('utf8'), 'r-1')
  const right = await post(app, '/exchange', bytes, headers)
  assert.equal(right.status, 200, await right.clone().text())
  const answered = Object(await right.json())
  assert.equal(answered.body, Buffer.from(bytes).toString('utf8'))
  const reread = JSON.stringify(JSON.parse(Buffer.from(bytes).toString('utf8')))
  const wrong = await post(app, '/exchange', bytes, githubLines(reread, 'r-2'))
  assert.equal(wrong.status, 401)
})

test('[05-11.27] a `v1` entry made with a public `whpk_` key as its secret is T7118', async (t) => {
  const app = await hooked(t)
  const body = '{"form":"contact"}'
  const at = nowIn(app)
  for (const key of [secrets.FORMS_KEY, Buffer.from(publicKey, 'base64'), publicKey]) {
    const answer = await post(app, '/hooks/keyed', body, standard(body, { at, key }))
    assert.equal(await codeOf(answer), 'T7118')
  }
  assert.equal(await settled(app, 'keyedReceived', 0), 0)
})

test('[05-11.28] a signed call of a scheme with no time, sent again after `incomingKept`, starts its flow again; a scheme with a time refuses it', async (t) => {
  const app = await hooked(t)
  const body = '{"action":"opened"}'
  const github = githubLines(body, 'delivery-again')
  const formBody = '{"form":"again"}'
  const form = standard(formBody, { at: nowIn(app), id: 'msg_again' })
  assert.equal((await post(app, '/hooks/github', body, github)).status, 200)
  assert.equal((await post(app, '/hooks/forms', formBody, form)).status, 200)
  assert.equal(await settled(app, 'githubReceived', 1), 1)
  assert.equal((await post(app, '/hooks/github', body, github)).status, 200)
  assert.equal(await settled(app, 'githubReceived', 1), 1, 'a repeat inside the time ids are kept starts nothing')
  advance(app, '3 days', 3 * 86_400_000)
  advance(app, '2 minutes', 120_000)
  assert.equal((await post(app, '/hooks/github', body, github)).status, 200)
  assert.equal(await settled(app, 'githubReceived', 2), 2)
  const again = await post(app, '/hooks/forms', formBody, form)
  assert.equal(await codeOf(again), 'T7118')
  assert.equal(await settled(app, 'formReceived', 1), 1)
})

test('[05-11.40] a `webhook-signature` of a thousand entries is looked at for twenty; two `webhook-id` headers and a time that is no number are T7118', async (t) => {
  const app = await hooked(t)
  const body = '{"form":"many"}'
  const at = nowIn(app)
  const right = standard(body, { at, id: 'msg_many' })
  const filler = Array.from({ length: 999 }, (_, n) => `v1,${Buffer.alloc(32, n % 251).toString('base64')}`)
  const late = { ...right, 'webhook-signature': [...filler, right['webhook-signature']].join(' ') }
  assert.equal(
    await codeOf(await post(app, '/hooks/forms', body, late)),
    'T7118',
    'the entry after the twentieth is not looked at',
  )
  const early = { ...right, 'webhook-signature': [right['webhook-signature'], ...filler].join(' ') }
  assert.equal((await post(app, '/hooks/forms', body, early)).status, 200)
  const twice = new Headers(right)
  twice.append('webhook-id', 'msg_other')
  const twoIds = await app.request(
    new Request('http://localhost/hooks/forms', { method: 'POST', headers: twice, body }),
    { from: '203.0.113.7' },
  )
  assert.equal(await codeOf(twoIds), 'T7118')
  const noNumber = { ...standard(body, { at, id: 'msg_nan' }), 'webhook-timestamp': `${at}.5` }
  assert.equal(await codeOf(await post(app, '/hooks/forms', body, noNumber)), 'T7118')
})

test('[05-11.47] a check of a signature made in `engine.ts` that answers an id it saw before starts no second run', async (t) => {
  const app = await hooked(t)
  const lines = { 'content-type': 'application/json', 'x-partner-key': secrets.PARTNER_KEY, 'x-partner-id': 'p-1' }
  const answers = await Promise.all(
    Array.from({ length: 50 }, (_, n) => post(app, '/hooks/partner/acme', `{"n":${n}}`, lines)),
  )
  assert.deepEqual([...new Set(answers.map((one) => one.status))], [200])
  assert.equal(await settled(app, 'partnerReceived', 1), 1)
})
