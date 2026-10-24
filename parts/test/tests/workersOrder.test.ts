import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp, TestWorker } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { notDropped } from './started.ts'

const system = { as: { kind: 'system' } } as const
const visitor = (id: string) => ({ as: { kind: 'nobody' as const, visitor: id } })

/** The test app of the project of heavy work, with kinds of worker added to what it states. */
async function heavyWith(t: TestContext, kinds = ''): Promise<TestApp> {
  const folder = copyOf(t, 'heavy')
  const file = join(folder, 'tent.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace('  workers: {\n', `  workers: {\n${kinds}`))
  const app = await testApp({ folder })
  closing(t, () => app.close())
  return app
}

const moment = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function until(what: string, holds: () => boolean | Promise<boolean>, tries = 1000): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await holds()) return
    await moment(5)
  }
  assert.fail(`never: ${what}`)
}

async function joined(t: TestContext, app: TestApp, kinds: string[]): Promise<TestWorker> {
  const worker = await app.worker({ kinds })
  closing(t, () => worker.close({ now: true }).catch(() => undefined))
  const id = worker.at().id
  await until('the worker is ready', () =>
    app.workers().some((one) => Reflect.get(Object(one), 'id') === id && Reflect.get(Object(one), 'ready').length > 0),
  )
  return worker
}

test('[51-2] with turns caller, the one task of a second caller goes before the tenth of the first', async (t) => {
  const app = await heavyWith(t, "    turns: { about: 'Each caller in turn', turns: 'caller' },\n")
  const worker = await joined(t, app, ['turns'])
  const first = notDropped(await app.start('onTurns', { n: 1 }, visitor('a'))).run
  await until('the worker is busy', () => worker.at().working[0]?.run === first)
  const theirs: string[] = []
  for (let n = 2; n <= 10; n++) theirs.push(notDropped(await app.start('onTurns', { n }, visitor('a'))).run)
  const second = notDropped(await app.start('onTurns', { n: 11 }, visitor('b'))).run
  // The order in which the worker took them.
  const order: string[] = [first]
  await until(
    'every task was worked on',
    () => {
      const now = worker.at().working[0]?.run
      if (now && !order.includes(now)) order.push(now)
      return order.length === 11
    },
    4000,
  )
  assert.ok(order.indexOf(second) < order.indexOf(theirs[8]), `the second caller waited behind the tenth: ${order}`)
  assert.ok(order.indexOf(second) <= 2, `the second caller did not have a turn: ${order.indexOf(second)}`)
})

test('[51-2] with workers.any stated orHere false a background step waits for a worker, and with busy it runs here while the one worker is busy', async (t) => {
  const waits = await heavyWith(t, "    any: { about: 'Never here', orHere: false },\n")
  const run = notDropped(await waits.start('onAny', { n: 2 }, system)).run
  await moment(300)
  assert.equal(waits.runs.read(run)?.state, 'waiting', 'the step ran with no worker joined')
  await joined(t, waits, ['any'])
  assert.equal(await waits.runs.wait(run), 4)

  const busy = await heavyWith(t, "    any: { about: 'Here while busy', orHere: 'busy' },\n")
  const worker = await joined(t, busy, ['any'])
  const held = notDropped(await busy.start('onAny', { n: 3 }, system)).run
  await until('the worker is busy', () => worker.at().working[0]?.run === held)
  const beside = notDropped(await busy.start('onAny', { n: 5 }, system)).run
  assert.equal(await busy.runs.wait(beside), 10)
  assert.equal(busy.runs.read(beside)?.state, 'done')
  assert.notEqual(worker.at().working[0]?.run, beside, 'the second step went to the busy worker')
  assert.equal(await busy.runs.wait(held), 6)
})

test('[51-2] a worker that was released holds the time of wait back no more: the step fails with T5107 after wait', async (t) => {
  const app = await heavyWith(t)
  const worker = await joined(t, app, ['slow'])
  app.release(worker.at().id)
  const run = notDropped(await app.start('onSlow', undefined, system)).run
  await until('the step waits', () => app.runs.read(run)?.state === 'waiting')
  app.clock.advance('2 minutes')
  await until('the run failed', () => app.runs.read(run)?.state === 'failed')
  assert.equal(app.runs.read(run)?.error?.code, 'T5107')
})
