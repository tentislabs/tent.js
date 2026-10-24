import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp, TestWorker } from '../index.ts'
import { testApp } from '../index.ts'
import { current, until } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'
import type { Heard, Remote } from './remotes.ts'
import { answerJson, remoteOf } from './remotes.ts'

const system = { as: { kind: 'system' } } as const
const secrets = { LEDGER_KEY: 'the key of the worker' }

/**
 * The project of work that calls out, copied with its ledger at a stand-in server, the limits of the ledger as the
 * test states them, and what the test adds to its files. Answers its test app and the folder that the app lies in.
 */
async function outside(
  t: TestContext,
  ledger: Remote,
  o: { limits: string; tent?: [string, string]; functions?: string; book?: string },
): Promise<{ app: TestApp; temp: string }> {
  const temp = tempOf(t)
  const folder = copyOf(t, 'workedOut')
  const functions = join(folder, 'functions.ts')
  const book = "post('/book', { input: { tag: text() } })"
  writeFileSync(
    functions,
    `${readFileSync(functions, 'utf8')
      .replaceAll('http://127.0.0.1:1', ledger.origin)
      .replace('limits: { perSecond: 2 }', o.limits)
      .replace(book, o.book ?? book)}${o.functions ?? ''}`,
  )
  if (o.tent) {
    const tent = join(folder, 'tent.ts')
    writeFileSync(tent, readFileSync(tent, 'utf8').replace(o.tent[0], o.tent[1]))
  }
  const app = await testApp({ folder, secrets: { LEDGER_KEY: 'the key of the writer' }, real: ['ledger'] })
  closing(t, () => app.close())
  return { app, temp }
}

/** A worker of a kind, with secrets of its own machine, closed when the test ends, once it said that it is ready. */
async function workerOf(t: TestContext, app: TestApp, kind: string): Promise<TestWorker> {
  const worker = await app.worker({ kinds: [kind], secrets })
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

/** The rows of a table of the log of the writer of a test app. */
function logRows(temp: string, table: string): Record<string, unknown>[] {
  const file = filesUnder(temp).find((one) => one.replaceAll('\\', '/').endsWith('/data/logs.db'))
  assert.ok(file, 'the writer keeps a log')
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db.prepare(`SELECT * FROM "${table}"`).all()
  } finally {
    db.close()
  }
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

test('[51-13] with ten workers a service that states `perSecond: 20` is called 20 times a second', async (t) => {
  const ledger = await remoteOf(t, (heard, response) => {
    answerJson(response, 200, { booked: heard.body.toString() })
  })
  const { app } = await outside(t, ledger, { limits: 'limits: { perSecond: 20 }' })
  for (let n = 0; n < 10; n++) await workerOf(t, app, 'gpu')
  const began = Date.now()
  await Promise.all(Array.from({ length: 50 }, (_, n) => app.call('bookOnGpu', { tag: `t${n}` }, system)))
  assert.equal(ledger.heard.length, 50)
  // Fifty calls at twenty a second: the last of them starts in the third second. Were the limit counted by each of
  // the ten workers, they would all have started within the first.
  assert.ok(Date.now() - began >= 2000, `fifty calls took ${Date.now() - began} ms`)
})

test('[51-13] a place under `atOnce` whose `did` arrives after the writer started again is taken until then, and freed by it', async (t) => {
  const held: ServerResponse[] = []
  const first = (heard: Heard): boolean => heard === ledger.heard[0]
  const ledger: Remote = await remoteOf(t, (heard, response) => {
    // The first call is held until the test answers it; every later one is answered at once.
    if (first(heard)) held.push(response)
    else answerJson(response, 200, { booked: heard.body.toString() })
  })
  const { app } = await outside(t, ledger, { limits: 'limits: { perSecond: 2, atOnce: 1 }' })
  await workerOf(t, app, 'gpu')
  await workerOf(t, app, 'gpu')
  // The call of the first is answered with the closing of its writer; its work goes on, on its worker.
  void app.call('bookOnGpu', { tag: 'first' }, system).catch(() => undefined)
  await until('the first call holds the place', () => ledger.heard.length === 1)
  await app.restart()
  await until(
    'both workers are back',
    () => app.workers().filter((one) => Reflect.get(Object(one), 'ready').length > 0).length === 2,
  )
  const second = app.call('bookOnGpu', { tag: 'second' }, system)
  await sleep(1500)
  assert.equal(ledger.heard.length, 1, 'the second waits for the place that the first still holds')
  const one = held.shift()
  if (one) answerJson(one, 200, { booked: 'first' })
  assert.deepEqual(await second, { booked: '{"tag":"second"}' })
  assert.equal(ledger.heard.length, 2)
})

test('[51-13] with `fetch` named in `outside`, the writer makes the fetch of the work, and a download past `inFrame` arrives as a file', async (t) => {
  const big = `${'x'.repeat(200_000)}tail!`
  const ledger = await remoteOf(t, (heard, response) => {
    if (heard.path === '/big') {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end(big)
    } else answerJson(response, 200, {})
  })
  const { app, temp } = await outside(t, ledger, {
    limits: 'limits: { perSecond: 2 }',
    tent: [
      '  cpu: {',
      "  net: { about: 'A machine whose writer fetches for it', outside: { fetch: 'writer' } },\n  cpu: {",
    ],
    functions: `
export const download = action('download', {
  access: anyone('a test downloads from a worker'),
  worker: 'net',
  limits: { time: '1 minute' },
  input: {},
  output: json(),
  run: async () => {
    const answer = await fetch('${ledger.origin}/big')
    const text = await answer.text()
    return { status: answer.status, size: text.length, end: text.slice(-5) }
  },
})
`,
  })
  await workerOf(t, app, 'net')
  assert.deepEqual(await app.call('download', {}, system), { status: 200, size: big.length, end: 'tail!' })
  assert.equal(ledger.heard.length, 1)
  // The writer made it: the row of the fetch is in its own log, with the host as its call.
  await until('the writer logged the fetch', () =>
    logRows(temp, 'outgoing').some((row) => String(row.call).includes('127.0.0.1')),
  )
})

test('[51-13] a reader that lacks a secret which a service of the version names hands a request for an action that states `changes: false` on before it runs', async (t) => {
  const ledger = await remoteOf(t, (heard, response) => answerJson(response, 200, { booked: heard.body.toString() }))
  const { app, temp } = await outside(t, ledger, {
    limits: 'limits: { perSecond: 2 }',
    book: "post('/book', { input: { tag: text() }, changes: false })",
    functions: `
export const peek = action('peek', {
  access: anyone('a test peeks at the ledger'),
  changes: false,
  input: { tag: text() },
  output: json(),
  run: async ({ input }) => ledger.book({ tag: input.tag }),
})
`,
  })
  const peeks = (): number => logRows(temp, 'calls').filter((row) => row.name === 'peek').length
  const peek = async (machine: TestApp, tag: string): Promise<unknown> => {
    const answer = await machine.request(
      new Request('http://localhost/_t/call/peek', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ input: { tag } }),
      }),
    )
    return Object(await answer.json()).value
  }
  // A reader that holds no secret of its own: the request is the writer's, and runs there once.
  const near = await app.reader()
  await current(app, near)
  assert.deepEqual(await peek(near, 'handed'), { booked: '{"tag":"handed"}' })
  assert.equal(ledger.heard.length, 1, 'the reader did not run it')
  assert.equal(ledger.heard[0].headers.authorization, 'Bearer the key of the writer')
  await until('the writer noted the call', () => peeks() === 1)
  // A reader whose own machine holds every secret carries it out itself, with its own secret.
  const holding = await app.reader({ secrets: { LEDGER_KEY: 'the key of the reader' } })
  await current(app, holding)
  assert.deepEqual(await peek(holding, 'here'), { booked: '{"tag":"here"}' })
  assert.equal(ledger.heard.at(-1)?.headers.authorization, 'Bearer the key of the reader')
  await sleep(300)
  assert.equal(peeks(), 1, 'the writer answered no call of it')
})
