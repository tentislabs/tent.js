import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine, makeSecretKey, writeKey } from '../../engine/index.ts'
import { copied } from './typed.ts'
import { notDropped } from './started.ts'

// The address of a program on another computer, which reaches the server through no proxy.
const away = '203.0.113.7'

// The private and the sealed value of the one person, which no answer to a key may hold.
const ssn = 'SSN-4471-PRIVATE'
const pin = 'PIN-9902-SEALED'

/** An app on live data with one person, and the keys a program away holds: of the right `operate`, of another right, and of none. */
async function served(t: TestContext): Promise<{ app: App; host: string; keys: Record<string, string>; id: string }> {
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, 'attacksOperated', 'keyAttacked')
  const built = await buildProject(project, { for: 'dev' })
  const data = join(project, '..', 'data')
  makeSecretKey(data)
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'live' })
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  await app.call('addPerson', { name: 'Ada', ssn, pin }, { as: { kind: 'system' } })
  const people = await app.read({ from: 'people' }, { as: { kind: 'system' } })
  const id = String(Reflect.get(Object(Array.isArray(people) ? people[0] : {}), 'id'))
  return {
    app,
    host: `127.0.0.1:${port}`,
    id,
    keys: {
      operate: writeKey(app, { name: 'ops', rights: ['operate'] }).key,
      publish: writeKey(app, { name: 'deploy', rights: ['publish'] }).key,
      plain: writeKey(app, { name: 'plain', scopes: ['*'] }).key,
    },
  }
}

/** A request of a program on another computer, with the key it holds. */
const asked = (
  app: App,
  host: string,
  path: string,
  key: string | undefined,
  body: unknown = { args: {} },
): Promise<Response> =>
  app.request(
    new Request(`http://${host}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body),
    }),
    { from: away },
  )

test('[48-7.2] the admin channel asked from another computer with no key, a key without the right operate, or that key for another command, a function or a row, is refused', async (t) => {
  const { app, host, keys } = await served(t)
  // The one way in that stands: the run commands and the log, with a key of the right `operate`.
  assert.equal((await asked(app, host, '/_t/admin/runs', keys.operate)).status, 200)
  assert.equal((await asked(app, host, '/_t/admin/logs', keys.operate)).status, 200)
  for (const [path, key, why] of [
    ['/_t/admin/runs', undefined, 'no key'],
    ['/_t/admin/logs', undefined, 'no key'],
    ['/_t/admin/runs', keys.publish, 'a key of the right publish'],
    ['/_t/admin/logs', keys.plain, 'a key of no right'],
    ['/_t/admin/runs', `${keys.operate.slice(0, -1)}${keys.operate.endsWith('A') ? 'B' : 'A'}`, 'a key one letter off'],
  ] as const) {
    const refused = await asked(app, host, path, key)
    assert.equal(refused.status, 401, `${path} with ${why}`)
  }
  // That key for every other command of the channel, under its own name and under a name that leads to it.
  for (const command of [
    'values',
    'secrets',
    'settings',
    'data/rows',
    'data/backup',
    'export',
    'snapshot',
    'read',
    'write',
    'run',
    'access-key',
    'access',
    'shot',
    'runs/../values',
    'runs%2F..%2Fvalues',
    'logs/',
    'Runs',
  ]) {
    const refused = await asked(app, host, `/_t/admin/${command}`, keys.operate, { args: { from: 'people' } })
    assert.notEqual(refused.status, 200, command)
    assert.doesNotMatch(await refused.text(), new RegExp(`${ssn}|${pin}|Ada`), command)
  }
  // That key for a function and for a row: the change adds nothing, and the query is refused.
  const before = await app.read({ from: 'people' }, { as: { kind: 'system' } })
  for (const [path, input] of [
    ['/_t/call/addPerson', { name: 'Bo', ssn: 'x', pin: 'y' }],
    ['/_t/call/everyone', {}],
    ['/_t/read/everyone', {}],
  ] as const) {
    const refused = await asked(app, host, path, keys.operate, { input })
    assert.notEqual(refused.status, 200, path)
    assert.doesNotMatch(await refused.text(), /Ada/, path)
  }
  assert.deepEqual(await app.read({ from: 'people' }, { as: { kind: 'system' } }), before)
})

test('[48-7.2] a key of the right operate opens no live connection that watches a row', async (t) => {
  const { app, host, keys } = await served(t)
  const end = app.live(new Request(`http://${host}/_t/live`, { headers: { authorization: `Bearer ${keys.operate}` } }))
  const got: Record<string, unknown>[] = []
  end.each((message) => void got.push(Object(message)))
  end.send({ t: 'watch', id: 'w', query: 'everyone', input: {} })
  const told = (): boolean => got.some((one) => one.t === 'result' || JSON.stringify(one).includes('"code"'))
  for (let i = 0; i < 300 && !told(); i++) await new Promise((done) => setTimeout(done, 10))
  end.close()
  assert.doesNotMatch(JSON.stringify(got), /Ada/, JSON.stringify(got))
  assert.ok(!got.some((one) => one.t === 'result'), JSON.stringify(got))
})

test('[48-7.3] tent logs asked by a key on a server never shows a private or sealed value: not in the calls, the errors, the slow queries nor the tree of a trace', async (t) => {
  const { app, host, keys, id } = await served(t)
  // The builder's own code writes both values into a line of the log and into the words of an error.
  await assert.rejects(app.call('checkPerson', { id }, { as: { kind: 'system' } }))
  const logged = await asked(app, host, '/_t/admin/logs', keys.operate, { args: {} })
  assert.equal(logged.status, 200)
  const told = String(await logged.text())
  assert.doesNotMatch(told, new RegExp(`${ssn}|${pin}`), 'the log')
  // Every trace that the log names is asked for as its tree, as `tent logs --trace` asks.
  const traces = new Set(told.match(/[0-9a-f]{32}/g) ?? [])
  assert.ok(traces.size > 0, 'the log names the trace of the call that failed')
  for (const trace of traces) {
    const tree = await asked(app, host, '/_t/admin/logs', keys.operate, { args: { trace } })
    if (tree.status !== 200) continue
    assert.doesNotMatch(await tree.text(), new RegExp(`${ssn}|${pin}`), `the tree of ${trace}`)
  }
  for (const args of [{ errors: true }, { slow: true }, { callers: true }, { vitals: true }]) {
    const one = await asked(app, host, '/_t/admin/logs', keys.operate, { args })
    assert.doesNotMatch(await one.text(), new RegExp(`${ssn}|${pin}`), JSON.stringify(args))
  }
})

test('[48-7.3] a run shown to a key on a server never shows a private value that a step read', async (t) => {
  const { app, host, keys } = await served(t)
  await app.call('addCard', { name: 'Ada', ssn }, { as: { kind: 'system' } })
  const cards = await app.read({ from: 'cards' }, { as: { kind: 'system' } })
  const card = String(Reflect.get(Object(Array.isArray(cards) ? cards[0] : {}), 'id'))
  const { run } = notDropped(await app.start('lookCard', { id: card }, { as: { kind: 'system' } }))
  const ends = performance.now() + 20_000
  while (app.runs.read(run)?.state !== 'waiting') {
    assert.ok(performance.now() < ends, `the run stands at ${app.runs.read(run)?.state}`)
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
  for (const what of ['list', 'show']) {
    const shown = await asked(app, host, '/_t/admin/runs', keys.operate, { args: { what, id: run } })
    assert.equal(shown.status, 200, what)
    assert.doesNotMatch(await shown.text(), new RegExp(`${ssn}|${pin}`), what)
  }
})
