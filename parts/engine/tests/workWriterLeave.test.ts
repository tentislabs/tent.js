import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import type { App, Provider, ReplyRequest } from '../index.ts'
import { bundled, engineOf, testClock, workFolder } from './apps.ts'
import { joiningKeys } from './workLink.ts'
import { person, realWorker, untilAsync } from './workUse.ts'
import { notDropped } from './started.ts'

// What the writer carries out for the work of a worker is held to the leave of its tool call, as `51`, section 4,
// says: each call at its own place, in the order the calls are made.

/** A model that asks for the flow tool when a person spoke last, and else says what it answered. */
const mine: Provider = {
  async *reply(o: ReplyRequest) {
    const last = o.messages.at(-1)
    if (last?.who === 'user') yield { end: { text: '', calls: [{ id: 'c1', tool: 'fetchTool', input: {} }] } }
    else yield { end: { text: JSON.stringify(last?.error ?? last?.result ?? null), calls: [] } }
  },
}

test("[51-13] [51-11.14@9a] the fetches that the writer makes for a worker's step are held to the leave of its tool call: the second lands on nth 1, and the person is asked about each", async (t) => {
  const { clock } = testClock()
  const bundle = await bundled(t, { project: 'workLeave' })
  const engine = engineOf(t, { makers: { clock: () => clock, providers: () => ({ mine }) } })
  const app: App = await engine.open(bundle.folder, {
    dataFolder: join(workFolder(t), 'data'),
    mode: 'test',
    insecure: true,
    workers: [joiningKeys.free],
    address: '*',
  })
  const places: unknown[] = []
  const sent = (frame: string | Uint8Array): void => {
    const read: unknown = JSON.parse(typeof frame === 'string' ? frame : new TextDecoder().decode(frame))
    if (Reflect.get(Object(read), 't') === 'failed')
      places.push(Reflect.get(Object(Reflect.get(Object(read), 'error')), 'place'))
  }
  await realWorker(t, { app: () => app, clock }, { sent })
  const ada = await person(app, 'Ada')
  const { run } = notDropped(await app.start('helper', { message: 'Fetch.' }, { as: ada }))
  let inner = ''
  const waiting = (): string | undefined => {
    const [one] = (app.runs.find({ top: run }) ?? []).filter((found) => found.flow === 'fetchTool')
    inner = one?.id ?? ''
    return (app.runs.read(inner)?.steps ?? []).find((step) => step.state === 'waiting')?.name
  }
  for (const nth of [0, 1]) {
    await untilAsync(`the fetch at nth ${nth} waits for a yes, or the run ended`, () =>
      Boolean(waiting() || ['done', 'failed'].includes(String(app.runs.read(run)?.state))),
    )
    const step = waiting()
    assert.ok(step, `the fetch at nth ${nth} was asked about: ${JSON.stringify(app.runs.read(run))}`)
    app.runs.approve(inner, step)
  }
  await untilAsync('the run ended', () => ['done', 'failed'].includes(String(app.runs.read(run)?.state)))
  assert.equal(app.runs.read(inner)?.answer, 'one two', JSON.stringify(app.runs.read(inner)?.steps))
  assert.deepEqual(places, [
    { name: 'fetch', nth: 0 },
    { name: 'fetch', nth: 1 },
  ])
})
