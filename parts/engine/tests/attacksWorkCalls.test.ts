import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import type { App, Provider, ReplyRequest } from '../index.ts'
import { bundled, engineOf, testClock, workFolder } from './apps.ts'
import { joiningKeys } from './workLink.ts'
import { person, realWorker, untilAsync } from './workUse.ts'
import { notDropped } from './started.ts'

/** A model that asks for the flow tool when a person spoke last, and else says what it answered. */
const mine: Provider = {
  async *reply(o: ReplyRequest) {
    const last = o.messages.at(-1)
    if (last?.who === 'user') yield { end: { text: '', calls: [{ id: 'c1', tool: 'fetchTool', input: {} }] } }
    else yield { end: { text: JSON.stringify(last?.error ?? last?.result ?? null), calls: [] } }
  },
}

test("[51-11.14@9a] a worker's outside call under a tool call that nobody agreed to is refused and asked about; after the person's yes it is made, and the run goes on", async (t) => {
  const { clock } = testClock()
  const bundle = await bundled(t, { project: 'reviewWork' })
  const engine = engineOf(t, { makers: { clock: () => clock, providers: () => ({ mine }) } })
  const app: App = await engine.open(bundle.folder, {
    dataFolder: join(workFolder(t), 'data'),
    mode: 'test',
    insecure: true,
    workers: [joiningKeys.free],
    address: '*',
  })
  await realWorker(t, { app: () => app, clock })
  const ada = await person(app, 'Ada')
  const { run } = notDropped(await app.start('helper', { message: 'Fetch.' }, { as: ada }))
  let inner = ''
  await untilAsync('the flow tool waits for a yes, or the run ended', () => {
    const [one] = (app.runs.find({ top: run }) ?? []).filter((found) => found.flow === 'fetchTool')
    inner = one?.id ?? ''
    const waits = Boolean(inner && (app.runs.read(inner)?.steps ?? []).some((step) => step.state === 'waiting'))
    return waits || app.runs.read(run)?.state === 'done'
  })
  // Nobody was asked where the run ended: the model was told that the person refused.
  assert.notEqual(app.runs.read(run)?.state, 'done', JSON.stringify(app.runs.read(run)?.answer))
  const asking = app.runs.read(inner)?.steps.find((step) => step.state === 'waiting')
  assert.equal(Reflect.get(Object(asking?.show), 'call'), 'fetch', JSON.stringify(asking))
  app.runs.approve(inner, String(asking?.name))
  await untilAsync('the run ended', () => ['done', 'failed'].includes(String(app.runs.read(run)?.state)))
  assert.equal(app.runs.read(inner)?.answer, 'fetched', JSON.stringify(app.runs.read(inner)?.steps))
  assert.deepEqual(app.runs.read(run)?.answer, { text: '"fetched"' })
})
