import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine, writeKey } from '../../engine/index.ts'
import type { Typed } from './typed.ts'
import { copied, typed } from './typed.ts'
import { notDropped } from './started.ts'

/** Waits until a run stands in a state, for what the app reads and for no length of time but a bound. */
async function untilState(app: App, run: string, state: string): Promise<void> {
  const ends = performance.now() + 20_000
  while (app.runs.read(run)?.state !== state) {
    assert.ok(performance.now() < ends, `the run stands at ${app.runs.read(run)?.state}, and not at ${state}`)
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
}

/** The rows of the log of the app that a command of the channel wrote, with what they say. */
function actsOf(data: string): { message: string; data: Record<string, unknown> }[] {
  const log = new DatabaseSync(join(data, 'logs.db'), { readOnly: true })
  try {
    return log
      .prepare(`SELECT message, data FROM lines WHERE name = 'admin runs' ORDER BY rowid`)
      .all()
      .map((row) => ({ message: String(row.message), data: Object(JSON.parse(String(row.data))) }))
  } finally {
    log.close()
  }
}

test('[48-9] with a key of the right operate, tent runs, runs show, a try again from a failed step, a move, an approval, a refusal, a stop and tent logs at --at a server answer and do what they do on this computer, each act kept in the log with the id of the key; any other key, and that key for any other command, a function or a row, is refused', async (t) => {
  // The engine ends before the copy of the project is taken away.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  t.after(() => Reflect.deleteProperty(globalThis, 'operatedShut'))
  const project = copied(t, 'operated', 'operatedShop')
  const built = await buildProject(project, { for: 'dev' })
  const data = join(project, '..', 'data')
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'live' })
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  const host = `127.0.0.1:${port}`
  const origin = `http://${host}`
  const operator = writeKey(app, { name: 'ops', rights: ['operate'] })
  const deploy = writeKey(app, { name: 'deploy', rights: ['publish'] })

  // The person keeps the key of the server under a name, as for publishing.
  process.env.TENT_KEY = operator.key
  process.env.TENT_AT = origin
  t.after(() => {
    delete process.env.TENT_KEY
    delete process.env.TENT_AT
  })
  const kept = await typed(project, 'login', origin, '--name', 'box', '--insecure', host, '--json')
  assert.equal(kept.ended, 0, kept.printed)
  const at = async (...words: string[]): Promise<Record<string, unknown>> => {
    const asked: Typed = await typed(project, ...words, '--at', 'box', '--insecure', host, '--json')
    assert.equal(asked.ended, 0, asked.printed)
    return Object(asked.answer.value)
  }

  const waiting = async (title: string): Promise<string> => {
    const { run } = notDropped(await app.start('bigOrder', { title }, { as: 'system' }))
    await untilState(app, run, 'waiting')
    return run
  }
  const first = await waiting('desk')
  const listed = await at('runs')
  assert.deepEqual(
    Object(listed.runs).map((one: { id: string; state: string }) => [one.id, one.state]),
    [[first, 'waiting']],
  )
  assert.equal((await at('runs', 'show', first)).id, first)
  assert.deepEqual(await at('runs', 'approve', first, 'approval'), { run: first, step: 'approval', approved: true })
  assert.match(String(await app.runs.wait(first)), /^desk \S+ yes \S+$/)
  // A run whose last step failed is tried again from that step, once the shop is open again.
  Reflect.set(globalThis, 'operatedShut', true)
  const { run: failed } = notDropped(await app.start('flakyOrder', { title: 'shelf' }, { as: 'system' }))
  await untilState(app, failed, 'failed')
  assert.equal(app.runs.read(failed)?.steps.find((one) => one.name === 'send')?.state, 'failed')
  Reflect.set(globalThis, 'operatedShut', false)
  const again = await at('runs', 'replay', failed, '--from', 'send')
  assert.deepEqual([again.of, again.from], [failed, 'send'])
  assert.match(String(await app.runs.wait(String(again.run))), /^shelf \S+ sent$/)
  const second = await waiting('lamp')
  assert.equal((await at('runs', 'move', second)).run, second)
  assert.deepEqual(await at('runs', 'refuse', second, 'approval'), { run: second, step: 'approval', approved: false })
  await app.runs.wait(second)
  const third = await waiting('chair')
  assert.deepEqual(await at('runs', 'stop', third), { run: third, state: 'stopped' })
  // The log of the app on the server answers too, and holds no words of an error that a value could stand in.
  const logged = await at('logs')
  assert.ok(Array.isArray(logged.calls))
  for (const row of Array.isArray(logged.errors) ? logged.errors : []) {
    assert.equal(Reflect.get(Object(row), 'message'), undefined)
    assert.equal(Reflect.get(Object(row), 'stack'), undefined)
  }
  // Each act on a run is kept in the log with the id of the key.
  assert.deepEqual(
    actsOf(data).map((one) => [one.message, one.data.run, one.data.key]),
    [
      ['runs approve', first, operator.row.id],
      ['runs replay', failed, operator.row.id],
      ['runs move', second, operator.row.id],
      ['runs refuse', second, operator.row.id],
      ['runs stop', third, operator.row.id],
    ],
  )

  /** A request of the admin channel as a program on another computer sends it, with the key it is handed. */
  const sent = (path: string, key: string | undefined, body: unknown = { args: { what: 'list' } }): Promise<Response> =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body),
    })
  assert.equal((await sent('/_t/admin/runs', operator.key)).status, 200)
  // No key, a key without the right, and that key for any other command, a function or a row: each is refused.
  for (const [path, key] of [
    ['/_t/admin/runs', undefined],
    ['/_t/admin/runs', deploy.key],
    ['/_t/admin/logs', deploy.key],
    ['/_t/admin/values', operator.key],
    ['/_t/admin/shot', operator.key],
  ] as const) {
    const refused = await sent(path, key)
    assert.equal(
      refused.status,
      401,
      `${path} with ${key === undefined ? 'no key' : key === deploy.key ? 'deploy' : 'ops'}`,
    )
    assert.equal(Reflect.get(Object(await refused.json()), 'ok'), false)
  }
  // A function and a row of the app, offered to the API for a signed-in caller: the key of the right operate changes
  // and reads nothing, there nor at the addresses of a page.
  const api = (key: string, name: string, input?: object): Promise<Response> =>
    fetch(`${origin}/api/${name}`, {
      method: input === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${key}`, ...(input ? { 'content-type': 'application/json' } : {}) },
      ...(input ? { body: JSON.stringify(input) } : {}),
    })
  await app.call('addOrder', { title: 'By the system' }, { as: { kind: 'system' } })
  assert.match(JSON.stringify(await app.call('everyOrder', {}, { as: { kind: 'system' } })), /By the system/)
  const before = await app.read({ from: 'orders' }, { as: 'system' })
  for (const called of [
    await api(operator.key, 'addOrder', { title: 'By the operator' }),
    await sent('/_t/call/addOrder', operator.key, { input: { title: 'By the operator' } }),
  ])
    assert.notEqual(called.status, 200, `${called.url}: ${await called.text()}`)
  assert.deepEqual(await app.read({ from: 'orders' }, { as: 'system' }), before)
  for (const read of [
    await api(operator.key, 'everyOrder'),
    await sent('/_t/read/everyOrder', operator.key, { input: {} }),
  ]) {
    assert.notEqual(read.status, 200)
    assert.doesNotMatch(await read.text(), /By the system/)
  }
  // The mails of the log are no answer for a key.
  assert.equal((await sent('/_t/admin/logs', operator.key, { args: { mail: true } })).status, 401)
})
