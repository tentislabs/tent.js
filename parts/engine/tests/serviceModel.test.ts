import assert from 'node:assert/strict'
import { cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { TentError } from '../../core/index.ts'
import type { TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { workFolder } from './apps.ts'
import { notDropped } from './started.ts'

const asked = { state: { order: 1 }, questions: { refund: { type: 'yes-no', instructions: 'Money back?' } } }

/** A copy of the project of the models over a service call, in the folder of the test. */
function project(t: test.TestContext): string {
  const folder = join(workFolder(t), 'decided')
  cpSync(join(import.meta.dirname, 'decided'), folder, { recursive: true })
  return folder
}

/** A test app of the project, with a user. */
async function decided(t: test.TestContext): Promise<{ app: TestApp; maya: Awaited<ReturnType<TestApp['user']>> }> {
  const app = await testApp({ folder: project(t) })
  t.after(() => app.close())
  return { app, maya: await app.user({ name: 'Maya', roles: [] }) }
}

/** The code and the fields that a promise was refused with, or `ok`. */
const refusal = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => 'ok',
    (error: unknown) => [Reflect.get(Object(error), 'code'), Reflect.get(Object(error), 'fields')],
  )

/** The answers of a check of a job, one after another: the last stands for every later check. */
const statuses = (...said: Record<string, unknown>[]): (() => Record<string, unknown>) => {
  let n = 0
  return () => said[Math.min(n++, said.length - 1)]
}

/** A faked model that asks for one tool when a person spoke last, and else answers what the tool answered. */
const oneTool = (tool: string) => (request: { messages: { who: string; result?: unknown; error?: unknown }[] }) => {
  const last = request.messages.at(-1)
  if (last?.who === 'user') return { calls: [{ tool, with: tool === 'paint' ? { prompt: 'a tent' } : {} }] }
  return { text: JSON.stringify(last?.error ?? last?.result ?? null) }
}

/** Waits until a step of a run waits, or the run ends, and answers the step that waits. */
async function waiting(app: TestApp, run: string): Promise<{ name: string; show?: unknown } | undefined> {
  for (let tries = 0; tries < 500; tries++) {
    const found = (app.runs.read(run)?.steps ?? []).find((one) => one.state === 'waiting')
    if (found) return Object(found)
    const state = app.runs.read(run)?.state
    if (state === 'done' || state === 'failed' || state === 'stopped') return undefined
    await new Promise((done) => setTimeout(done, 10))
  }
  return undefined
}

test('[26-7] a model that states job starts the work once, hands check what with names, checks until done fits, and fails with T7104 when failed fits', async (t) => {
  const { app, maya } = await decided(t)
  const service = app.fake('decisions', {
    paint: () => ({ id: 'job-1', queued: true }),
    status: statuses({ status: 'running' }, { status: 'succeeded', picture: 'tent.png' }),
  })
  assert.deepEqual(await app.as(maya).call('paint', { prompt: 'a tent' }), { status: 'succeeded', picture: 'tent.png' })
  assert.deepEqual(
    service.sent.map((one) => [one.call, one.input]),
    [
      ['paint', { prompt: 'a tent' }],
      ['status', { job: 'job-1' }],
      ['status', { job: 'job-1' }],
    ],
  )
  app.fake('decisions', { paint: () => ({ id: 'job-2' }), status: () => ({ status: 'canceled' }) })
  assert.deepEqual((await refusal(app.as(maya).call('paint', { prompt: 'a tent' })))?.toString().slice(0, 5), 'T7104')
})

test('[26-7] after a kill the job goes on with the same job, and starts no second one', async (t) => {
  const folder = workFolder(t)
  const killed = await runKilled(join(import.meta.dirname, 'killed', 'job.ts'), {
    times: 1,
    when: 'waiting',
    seed: 267,
    args: [project(t), join(folder, 'bundle'), join(folder, 'data'), join(folder, 'told')],
  })
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  assert.match(again.out, /^answer: \{"picture":"job-1\.png","status":"succeeded"\}$/m)
  // The job was started once, before the kill: the step that ran again went on with it.
  assert.deepEqual(
    readFileSync(join(folder, 'told', 'started.txt'), 'utf8')
      .trim()
      .split('\n'),
    ['started'],
  )
})

test('[26-7] called as a function it makes its call once; what units names is read from the whole answer and counted, and perDay stops it', async (t) => {
  const { app, maya } = await decided(t)
  const service = app.fake('decisions', {
    decide: () => ({ answers: { refund: 'yes' }, usage: { input_tokens: 7 } }),
  })
  assert.deepEqual(await app.as(maya).call('decide', {}), { answers: { refund: 'yes' } })
  assert.deepEqual(service.sent, [{ call: 'decide', input: asked }])
  // Seven tokens a call, read from the whole answer: the second call passes ten, and the third is not made.
  await app.as(maya).call('decide', {})
  assert.deepEqual(await refusal(app.as(maya).call('decide', {})), ['T7102', { limit: 'perDay', unit: 'tokensIn' }])
  assert.equal(service.sent.length, 2)
})

test('[26-7] a status of 429 is tried once more and then given to the next model', async (t) => {
  const { app, maya } = await decided(t)
  const busy = (): never => {
    throw new TentError('T7115', 'The service is busy.', { service: { status: 429 } })
  }
  const service = app.fake('decisions', { decide: busy, decideAgain: () => ({ answers: { refund: 'no' } }) })
  assert.deepEqual(await app.as(maya).call('decide', {}), { answers: { refund: 'no' } })
  assert.deepEqual(
    service.sent.map((one) => one.call),
    ['decide', 'decide', 'decideAgain'],
  )
})

test('[26-7] under a tool call that nobody agreed to it is asked about like its call, a job once for its start, and it passes when the call states sends: false', async (t) => {
  const { app, maya } = await decided(t)
  const service = app.fake('decisions', {
    decide: () => ({ answers: { refund: 'yes' } }),
    look: () => ({ answers: { refund: 'no' } }),
    paint: () => ({ id: 'job-1' }),
    status: statuses({ status: 'running' }, { status: 'succeeded', picture: 'tent.png' }),
  })
  app.fake('writer', oneTool('decide'))
  const decide = notDropped(await app.start('helper', { message: 'Decide.' }, { as: maya }))
  assert.deepEqual((await waiting(app, decide.run))?.show, { call: 'decisions.decide' })
  assert.equal(service.sent.length, 0)
  app.runs.approve(decide.run, 'tool 1.1 decide')
  assert.deepEqual(await app.runs.wait(decide.run), { text: '{"answers":{"refund":"yes"}}' })
  app.fake('writer', oneTool('look'))
  const look = notDropped(await app.start('helper', { message: 'Look.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(look.run), { text: '{"answers":{"refund":"no"}}' })
  app.fake('writer', oneTool('paint'))
  const paint = notDropped(await app.start('helper', { message: 'Paint.' }, { as: maya }))
  assert.deepEqual((await waiting(app, paint.run))?.show, { call: 'decisions.paint' })
  app.runs.approve(paint.run, 'tool 1.1 paint')
  assert.deepEqual(await app.runs.wait(paint.run), { text: '{"picture":"tent.png","status":"succeeded"}' })
  assert.equal(service.sent.filter((one) => one.call === 'paint').length, 1)
})
