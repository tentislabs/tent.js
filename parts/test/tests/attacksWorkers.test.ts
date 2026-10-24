import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp, TestWorker } from '../index.ts'
import { testApp } from '../index.ts'
import { until } from './many.ts'
import { closing, copyOf } from './projects.ts'
import type { Remote } from './remotes.ts'
import { answerJson, remoteOf } from './remotes.ts'

const system = { as: { kind: 'system' } } as const

async function workerOf(t: TestContext, app: TestApp, kind: string): Promise<TestWorker> {
  const worker = await app.worker({ kinds: [kind], secrets: { LEDGER_KEY: 'the key of the worker' } })
  closing(t, () => worker.close({ now: true }).catch(() => undefined))
  const id = worker.at().id
  await until('the worker is ready', () =>
    app.workers().some((one) => Reflect.get(Object(one), 'id') === id && Reflect.get(Object(one), 'ready').length > 0),
  )
  return worker
}

test('[51-11.14] a worker whose try is lost after its `may` took the one place of `atOnce` frees it: the call is made again', async (t) => {
  let first = true
  const ledger: Remote = await remoteOf(t, (heard, response) => {
    // The first call never ends: its worker is killed while it waits.
    if (first) {
      first = false
      return
    }
    answerJson(response, 200, { booked: heard.body.toString() })
  })
  const folder = copyOf(t, 'workedOut')
  const file = join(folder, 'functions.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replace('http://127.0.0.1:1', ledger.origin)
      .replace('limits: { perSecond: 2 }', 'limits: { perSecond: 2, atOnce: 1 }'),
  )
  const app = await testApp({ folder, secrets: { LEDGER_KEY: 'the key of the writer' }, real: ['ledger'] })
  closing(t, () => app.close())
  const one = await workerOf(t, app, 'gpu')
  const booked = app.call('bookOnGpu', { tag: 'held' }, system)
  await until('the first worker called', () => ledger.heard.length === 1)
  await one.kill()
  await workerOf(t, app, 'gpu')
  const answer = await Promise.race([
    booked,
    new Promise((done) => setTimeout(() => done('the place was never freed'), 20_000)),
  ])
  assert.deepEqual(answer, { booked: '{"tag":"held"}' })
  assert.equal(ledger.heard.length, 2)
})
