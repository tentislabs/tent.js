import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import type { App, Provider, ReplyRequest } from '../index.ts'
import { bundled, engineOf, testClock, workFolder } from './apps.ts'
import { joiningKeys } from './workLink.ts'
import { person, realWorker, untilAsync } from './workUse.ts'
import { notDropped } from './started.ts'

// The calls that a worker sends its writer for an outside call are those of the table of `51`, section 4: the yes
// of a person crosses in the `may`, and the answer of an agreed call in the `did`.

/** A model that asks for the flow tool when a person spoke last, and else says what it answered. */
const mine: Provider = {
  async *reply(o: ReplyRequest) {
    const last = o.messages.at(-1)
    if (last?.who === 'user') yield { end: { text: '', calls: [{ id: 'c1', tool: 'fetchTool', input: {} }] } }
    else yield { end: { text: JSON.stringify(last?.error ?? last?.result ?? null), calls: [] } }
  },
}

test("[51-13] [51-11.14@9a] a worker's outside call under a tool call crosses as a may with its key and its nth, which asks the person's yes, and a did that keeps the answer, and as no other call", async (t) => {
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
  const calls: Record<string, unknown>[] = []
  const sent = (frame: string | Uint8Array): void => {
    const read: unknown = JSON.parse(typeof frame === 'string' ? frame : new TextDecoder().decode(frame))
    if (Reflect.get(Object(read), 't') === 'call') calls.push(Object(read))
  }
  await realWorker(t, { app: () => app, clock }, { sent })
  const ada = await person(app, 'Ada')
  const { run } = notDropped(await app.start('helper', { message: 'Fetch.' }, { as: ada }))
  let inner = ''
  await untilAsync('the flow tool waits for a yes, or the run ended', () => {
    const [one] = (app.runs.find({ top: run }) ?? []).filter((found) => found.flow === 'fetchTool')
    inner = one?.id ?? ''
    const waits = Boolean(inner && (app.runs.read(inner)?.steps ?? []).some((step) => step.state === 'waiting'))
    return waits || app.runs.read(run)?.state === 'done'
  })
  const asking = app.runs.read(inner)?.steps.find((step) => step.state === 'waiting')
  assert.equal(Reflect.get(Object(asking?.show), 'call'), 'fetch', JSON.stringify(asking))
  app.runs.approve(inner, String(asking?.name))
  await untilAsync('the run ended', () => ['done', 'failed'].includes(String(app.runs.read(run)?.state)))
  assert.equal(app.runs.read(inner)?.answer, 'fetched', JSON.stringify(app.runs.read(inner)?.steps))
  // `51`, section 4: `may` carries `{ service?, model?, call, key, nth }`, and `did` the same with `answer`.
  const whats = [...new Set(calls.map((one) => String(one.what)))].sort()
  assert.deepEqual(whats, ['did', 'may'], JSON.stringify(calls))
  const mays = calls.filter((one) => one.what === 'may')
  assert.equal(mays.length, 2, 'a may for each try: the one the person was asked about, and the one after the yes')
  for (const one of mays) assert.deepEqual([typeof one.key, typeof one.nth], ['string', 'number'], JSON.stringify(one))
  const kept = calls.filter((one) => one.what === 'did' && one.ok === true && one.answer !== undefined)
  assert.equal(kept.length, 1, JSON.stringify(calls))
  assert.equal(Reflect.get(Object(kept[0]?.answer), 'status'), 200)
})

test('[51-13] [51-11.14@9a] the may of an agreed outside call that was made already is answered what was kept, and the worker makes the call no second time', async (t) => {
  const { clock, advance } = testClock()
  const bundle = await bundled(t, { project: 'workAgreed' })
  const engine = engineOf(t, { makers: { clock: () => clock, providers: () => ({ mine }) } })
  const app: App = await engine.open(bundle.folder, {
    dataFolder: join(workFolder(t), 'data'),
    mode: 'test',
    insecure: true,
    workers: [joiningKeys.free],
    address: '*',
  })
  const calls: Record<string, unknown>[] = []
  const sent = (frame: string | Uint8Array): void => {
    const read: unknown = JSON.parse(typeof frame === 'string' ? frame : new TextDecoder().decode(frame))
    if (Reflect.get(Object(read), 't') === 'call') calls.push(Object(read))
  }
  await realWorker(t, { app: () => app, clock }, { sent })
  const ada = await person(app, 'Ada')
  const { run } = notDropped(await app.start('helper', { message: 'Fetch.' }, { as: ada }))
  let inner = ''
  await untilAsync('the flow tool waits for a yes', () => {
    const [one] = (app.runs.find({ top: run }) ?? []).filter((found) => found.flow === 'fetchTool')
    inner = one?.id ?? ''
    return Boolean(inner && (app.runs.read(inner)?.steps ?? []).some((step) => step.state === 'waiting'))
  })
  const asking = app.runs.read(inner)?.steps.find((step) => step.state === 'waiting')
  app.runs.approve(inner, String(asking?.name))
  // The try after the yes fetches and fails; the one after it waits a second, and is handed what was kept.
  await untilAsync('the run ended', () => {
    advance(1_000)
    return ['done', 'failed'].includes(String(app.runs.read(run)?.state))
  })
  assert.equal(app.runs.read(inner)?.answer, 'fetched', JSON.stringify(app.runs.read(inner)?.steps))
  const mays = calls.filter((one) => one.what === 'may')
  const dids = calls.filter((one) => one.what === 'did')
  assert.deepEqual([mays.length, dids.length], [3, 1], JSON.stringify(calls))
  assert.deepEqual([mays[2]?.key, mays[2]?.nth], [mays[1]?.key, mays[1]?.nth], 'the third try names the same call')
})
