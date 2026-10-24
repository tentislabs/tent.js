import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { bundleOf, shopIn } from './bundledShop.ts'
import { freePort, startTent, untilMinute, workOf } from './secured.ts'

// A secret that a function of the app sets itself, in an app that `tent start` runs as a server.

/** Builds the shop, with the files that are handed beside it, and runs it with `tent start` on live data. */
async function started(t: TestContext, files: Record<string, string> = {}) {
  const folder = workOf(t, 'started-secrets')
  const bundle = await bundleOf(shopIn(folder, { files }))
  const data = join(folder, 'data')
  const port = await freePort()
  // The key of the secrets, as a server is handed it.
  const env = { TENT_SECRET_KEY: randomBytes(32).toString('base64') }
  startTent(t, [bundle, '--data', data, '--port', String(port)], { cwd: folder, env })
  await untilMinute(() => existsSync(join(data, 'engine.json')), 'the engine of tent start')
  const origin = `http://127.0.0.1:${port}`
  await untilMinute(async () => (await fetch(`${origin}/_t/health`).catch(() => undefined))?.ok === true, 'the app')
  return { origin, data }
}

/** A call of a function of the app over its door, as a page of the app makes it. */
async function called(origin: string, name: string, input: object) {
  const answer = await fetch(`${origin}/_t/call/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ input }),
  })
  const text = await answer.text()
  return { status: answer.status, text, body: JSON.parse(text) }
}

/** What a command of this computer reads of the log of the app, through the admin channel, with its token. */
async function logsOf(origin: string, data: string, args: object): Promise<string> {
  const { token } = JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8'))
  const answer = await fetch(`${origin}/_t/admin/logs`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  return answer.text()
}

test('[41-8] a function of an app that tent start runs, which states system, sets a secret with secrets.set, and the next call uses it', async (t) => {
  const { origin, data } = await started(t)
  const set = await called(origin, 'setKey', { value: 'sk-live-0123456789abcdef' })
  assert.equal(set.status, 200, set.text)
  const length = await called(origin, 'keyLength', {})
  assert.deepEqual(length.body, { ok: true, value: 24 })
  // The secret is kept in the live file of the data folder, sealed: its value is in no file there.
  assert.ok(existsSync(join(data, 'secrets.live')))
  assert.equal(readFileSync(join(data, 'secrets.live'), 'utf8').includes('sk-live-0123456789abcdef'), false)
})

test('[41-12.41] secrets.set in a function with no system, in an app that tent start runs, is T0013; a value it set is in neither the log nor the answer', async (t) => {
  const { origin, data } = await started(t, {
    'functions/sneak.ts':
      "import { action, anyone, secrets, text } from 'tentjs'\n\nexport const sneak = action('sneak', {\n  access: anyone('a page of the app'),\n  input: { value: text() },\n  run: async ({ input }) => secrets.set('PAY_KEY', input.value),\n})\n",
  })
  const value = 'sk-live-the-value-of-the-review-0123'
  const refused = await called(origin, 'sneak', { value })
  // On live data the caller is told T0009 and a reference; the log holds the refusal by its own code.
  assert.equal(refused.body.error?.code, 'T0009', refused.text)
  assert.equal(refused.text.includes(value), false)
  const failed = await logsOf(origin, data, { errors: true })
  // T0013 is written into the log by its name.
  assert.match(failed, /not-allowed-here: sneak used `secrets.set`/)
  assert.match(failed, new RegExp(String(refused.body.error?.ref)))
  const set = await called(origin, 'setKey', { value })
  assert.equal(set.status, 200, set.text)
  assert.equal(set.text.includes(value), false)
  // What the log holds is written a moment after the call.
  await new Promise((done) => setTimeout(done, 1500))
  assert.equal((await logsOf(origin, data, {})).includes(value), false)
  for (const file of readdirSync(data).filter((one) => one.startsWith('logs.db')))
    assert.equal(readFileSync(join(data, file)).includes(value), false, file)
})
