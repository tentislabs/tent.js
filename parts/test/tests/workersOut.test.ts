import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ServerResponse } from 'node:http'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp, TestWorker } from '../index.ts'
import { testApp } from '../index.ts'
import { until } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'
import type { Remote } from './remotes.ts'
import { answerJson, remoteOf } from './remotes.ts'

const system = { as: { kind: 'system' } } as const

/** The project of work that calls out, with its ledger at a stand-in server, and the folder its test app lies in. */
async function workedOut(t: TestContext): Promise<{ app: TestApp; ledger: Remote; temp: string }> {
  const temp = tempOf(t)
  const ledger = await remoteOf(t, (heard, response) => answerJson(response, 200, { booked: heard.body.toString() }))
  const folder = copyOf(t, 'workedOut')
  const file = join(folder, 'functions.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace('http://127.0.0.1:1', ledger.origin))
  const app = await testApp({ folder, secrets: { LEDGER_KEY: 'the key of the writer' }, real: ['ledger'] })
  closing(t, () => app.close())
  return { app, ledger, temp }
}

/** A worker of a kind, with secrets of its own machine, closed when the test ends, once it said that it is ready. */
async function workerOf(
  t: TestContext,
  app: TestApp,
  kind: string,
  secrets?: Record<string, string>,
): Promise<TestWorker> {
  const worker = await app.worker({ kinds: [kind], ...(secrets ? { secrets } : {}) })
  closing(t, () => worker.close({ now: true }).catch(() => undefined))
  const id = worker.at().id
  await until('the worker is ready', () =>
    app.workers().some((one) => Reflect.get(Object(one), 'id') === id && Reflect.get(Object(one), 'ready').length > 0),
  )
  return worker
}

/** Every file of a folder and below it, by its place. */
function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const lies = join(folder, name)
    return statSync(lies).isDirectory() ? filesUnder(lies) : [lies]
  })
}

/** The messages of the lines of the log of the writer of a test app, those that its workers sent among them. */
function logged(temp: string): string[] {
  const file = filesUnder(temp).find((one) => one.replaceAll('\\', '/').endsWith('/data/logs.db'))
  if (!file) return []
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db
      .prepare('SELECT message FROM lines')
      .all()
      .map((row) => String(row.message))
  } finally {
    db.close()
  }
}

/** The rows of `outgoing` in the log of the writer of a test app. */
function outgoing(temp: string): Record<string, unknown>[] {
  const file = filesUnder(temp).find((one) => one.replaceAll('\\', '/').endsWith('/data/logs.db'))
  assert.ok(file, 'the writer keeps a log')
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db.prepare('SELECT * FROM outgoing').all()
  } finally {
    db.close()
  }
}

test("[51-13] a service call that the work on a worker makes is made by the worker, with the secrets of its own machine, and is in `outgoing` of the writer's log", async (t) => {
  const { app, ledger, temp } = await workedOut(t)
  await workerOf(t, app, 'gpu', { LEDGER_KEY: 'the key of the worker' })
  assert.deepEqual(await app.call('bookOnGpu', { tag: 'one' }, system), { booked: '{"tag":"one"}' })
  assert.equal(ledger.heard.length, 1)
  assert.equal(ledger.heard[0].headers.authorization, 'Bearer the key of the worker', 'the worker made the call')
  await until('the writer wrote the row of the call', () =>
    outgoing(temp).some((one) => one.service === 'ledger' && one.call === 'book' && one.status === 200),
  )
})

test('[51-13] on a kind whose `outside` names `services` the worker holds no secret, and the call is made by the writer, once', async (t) => {
  const { app, ledger } = await workedOut(t)
  await workerOf(t, app, 'cpu')
  assert.deepEqual(await app.call('bookOnCpu', { tag: 'two' }, system), { booked: '{"tag":"two"}' })
  assert.equal(ledger.heard.length, 1)
  assert.equal(ledger.heard[0].headers.authorization, 'Bearer the key of the writer', 'the writer made the call')
})

test('[51-13] the limits of a service are counted by the writer: two workers do not pass `perSecond` twice', async (t) => {
  const { app, ledger } = await workedOut(t)
  await workerOf(t, app, 'gpu', { LEDGER_KEY: 'the key of the worker' })
  await workerOf(t, app, 'gpu', { LEDGER_KEY: 'the key of the worker' })
  const began = Date.now()
  await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((tag) => app.call('bookOnGpu', { tag }, system)))
  assert.equal(ledger.heard.length, 6)
  // Two calls a second: the sixth starts in the third second.
  assert.ok(Date.now() - began >= 2000, `six calls took ${Date.now() - began} ms`)
})

test('[51-13] a `may` that waits for the one place of `atOnce` while its try is lost keeps no place: the try again is made', async (t) => {
  const held: ServerResponse[] = []
  const ledger = await remoteOf(t, (heard, response) => {
    // The first call is held until the test answers it; every later one is answered at once.
    if (heard === ledger.heard[0]) held.push(response)
    else answerJson(response, 200, { booked: heard.body.toString() })
  })
  const temp = tempOf(t)
  const folder = copyOf(t, 'workedOut')
  const file = join(folder, 'functions.ts')
  // The work writes a line of the log just before its call, so the test knows when its `may` was sent.
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replace('http://127.0.0.1:1', ledger.origin)
      .replace('limits: { perSecond: 2 }', 'limits: { perSecond: 2, atOnce: 1 }')
      .replace('import { action,', 'import { action, log,')
      .replace(
        'run: async ({ input }) => ledger.book({ tag: input.tag }),',
        'run: async ({ input }) => {\n    log.info("booking " + input.tag)\n    return ledger.book({ tag: input.tag })\n  },',
      ),
  )
  const app = await testApp({ folder, secrets: { LEDGER_KEY: 'the key of the writer' }, real: ['ledger'] })
  closing(t, () => app.close())
  const secrets = { LEDGER_KEY: 'the key of the worker' }
  await workerOf(t, app, 'gpu', secrets)
  const first = app.call('bookOnGpu', { tag: 'first' }, system)
  await until('the first call holds the place', () => ledger.heard.length === 1)
  const waiting = await workerOf(t, app, 'gpu', secrets)
  const second = app.call('bookOnGpu', { tag: 'second' }, system)
  await until('the second try began its call', () => logged(temp).includes('booking second'))
  await new Promise((done) => setTimeout(done, 300))
  // The worker of the second try is killed while its `may` waits; then the place is freed.
  await waiting.kill()
  // Lost, its task waits in the queue again: the one worker left still holds the first.
  // A worker is taken as gone after `workBehind` and a beat, which a computer at work may stretch.
  await until(
    'the writer took the try of the killed worker as lost',
    () => app.work().some((one) => Reflect.get(Object(one), 'kind') === 'gpu' && Reflect.get(Object(one), 'out') === 1),
    3000,
  )
  const one = held.shift()
  if (one) answerJson(one, 200, { booked: 'first' })
  assert.deepEqual(await first, { booked: 'first' })
  const answer = await Promise.race([
    second,
    new Promise((done) => setTimeout(() => done('the place was kept by the lost may'), 20_000)),
  ])
  assert.deepEqual(answer, { booked: '{"tag":"second"}' })
})
