import assert from 'node:assert/strict'
import { test } from 'node:test'
import { untilWithin } from './flowing.ts'
import { joiningKeys, readyWorker, writerOf } from './workLink.ts'

test('[51-5] an action that states callerGone stop has its work stopped when its caller left after the hand-out, and one that does not goes on', async (t) => {
  const { app, origin } = await writerOf(t)
  const worker = await readyWorker(app, joiningKeys.free)
  for (const [name, stops] of [
    ['encodeStops', true],
    ['encodeGoesOn', false],
  ] as const) {
    const leaving = new AbortController()
    const asked = fetch(`${origin}/_t/call/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { n: 5 } }),
      signal: leaving.signal,
    }).catch(() => undefined)
    const work = Object((await worker.next('work')).task)
    // The caller leaves once the task was handed out.
    leaving.abort()
    await asked
    const run = String(work.run)
    if (stops) {
      await untilWithin(() => app.runs.read(run)?.state === 'stopped', `the run of ${name} was stopped`)
      continue
    }
    await new Promise((done) => setTimeout(done, 200))
    assert.equal(app.runs.read(run)?.state, 'running', `the run of ${name} went on`)
    worker.send({ t: 'started', task: work.id })
    worker.send({ t: 'done', task: work.id, result: 5, cpuMs: 1 })
    assert.equal(await app.runs.wait(run), 5)
  }
})
