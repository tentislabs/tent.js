import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { App } from '../../engine/index.ts'
import { here, openedCommands } from './lineApp.ts'

/** What `/_t/cli/me` answers a request with these headers, from that address. */
async function me(app: App, data: string, headers: Record<string, string>, from = '127.0.0.1', host?: string) {
  const at = new URL(here(data))
  const answer = await app.request(new Request(`http://${host ?? at.host}/_t/cli/me`, { headers: { ...headers } }), {
    from,
  })
  const text = await answer.text()
  let value: unknown
  try {
    value = Reflect.get(Object(JSON.parse(text)), 'value')
  } catch {
    value = text
  }
  return { status: answer.status, value, text }
}

const tokenOf = (data: string): string => String(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).token)

test('[05-12.1] a request with `Tent-Caller: system` and no admin token, with a wrong one, and from another computer is nobody', async (t) => {
  const { app, data } = await openedCommands(t)
  const token = tokenOf(data)
  const caller = { 'tent-caller': 'system' }
  assert.deepEqual((await me(app, data, { ...caller, authorization: `Bearer ${token}` })).value, { system: true })
  assert.deepEqual((await me(app, data, caller)).value, {})
  assert.deepEqual(
    (
      await me(app, data, {
        ...caller,
        authorization: `Bearer ${token.slice(0, -1)}${token.endsWith('x') ? 'y' : 'x'}`,
      })
    ).value,
    {},
  )
  assert.deepEqual((await me(app, data, { ...caller, authorization: `Bearer ${token}` }, '203.0.113.5')).value, {})
  assert.deepEqual(
    (await me(app, data, { ...caller, authorization: `Bearer ${token}` }, '::ffff:203.0.113.5')).value,
    {},
  )
})

test('[05-12.2] a page in a browser on this computer that sends `Tent-Caller` has no token, and a name of its own is T0017', async (t) => {
  const { app, data } = await openedCommands(t)
  const origin = here(data)
  const page = await me(app, data, { 'tent-caller': 'system', origin, cookie: 'tent_visitor.shop=x' })
  assert.deepEqual(page.value, {})
  const named = await me(app, data, { 'tent-caller': 'system' }, '127.0.0.1', 'attacker.localhost')
  assert.equal(named.status, 421)
  assert.match(named.text, /T0017/)
})

test('[05-12.5] `/_t/b/cli/../description.json`, with percent signs and with backslashes, is not found', async (t) => {
  const { app, data } = await openedCommands(t, { commands: true })
  const at = here(data)
  for (const path of [
    '/_t/b/cli/../description.json',
    '/_t/b/cli/%2e%2e/description.json',
    '/_t/b/cli/..%2fdescription.json',
    '/_t/b/cli/..%2Fdescription.json',
    '/_t/b/cli/..%5cdescription.json',
    '/_t/b/cli/..\\description.json',
    '/_t/b/cli/%2e%2e%5cdescription.json',
  ]) {
    const answer = await app.request(new Request(`${at}${path}`), { from: '127.0.0.1' })
    const text = await answer.text()
    assert.notEqual(answer.status, 200, `${path}: ${text.slice(0, 80)}`)
    assert.doesNotMatch(text, /"functions"|"project"/, path)
  }
})
