import assert from 'node:assert/strict'
import test from 'node:test'
import type { App } from '../index.ts'
import { system } from './apps.ts'
import { counting } from './countingApps.ts'
import { notDropped } from './started.ts'

const bytes = (text: string): number => new TextEncoder().encode(text).length

/** Sends a call through the door, and answers the body it sent and the text it was answered with. */
async function through(
  origin: string,
  app: App,
  name: string,
  input: object = {},
): Promise<{ sent: string; answered: string }> {
  const sent = JSON.stringify({ input })
  const answer = await app.request(
    new Request(`${origin}/_t/call/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sent,
    }),
  )
  return { sent, answered: await answer.text() }
}

test('[21-22] a call of a query, of a change and of an action adds calls and ms under its name, a failed one failed, a change its rowsWritten, and through the door the bytes of the request and of the answer', async (t) => {
  const { app, origin, counted, sum } = await counting(t)
  const two = await through(origin, app, 'addTwo')
  const one = await through(origin, app, 'addNote', { title: 'A note' })
  const read = await through(origin, app, 'listNotes')
  await through(origin, app, 'broken')
  await app.call('outer', {}, { as: system })
  const rows = await counted()
  for (const name of ['addTwo', 'addNote', 'listNotes', 'broken', 'outer']) {
    assert.ok(sum(rows, name, 'calls') >= 1, `${name} is counted`)
    assert.ok(sum(rows, name, 'ms') > 0, `${name} took some time`)
  }
  assert.equal(sum(rows, 'broken', 'failed'), 1)
  assert.equal(sum(rows, 'listNotes', 'failed'), 0)
  assert.equal(sum(rows, 'addTwo', 'rowsWritten'), 2)
  // One row through the door, and one more from the code of `outer`.
  assert.equal(sum(rows, 'addNote', 'rowsWritten'), 2)
  for (const [name, call] of [
    ['addTwo', two],
    ['addNote', one],
    ['listNotes', read],
  ] as const) {
    assert.equal(sum(rows, name, 'bytesIn'), bytes(call.sent), name)
    assert.equal(sum(rows, name, 'bytesOut'), bytes(call.answered), name)
  }
  // A call from code is no request: it brings no bytes.
  assert.equal(sum(rows, 'outer', 'bytesIn'), 0)
  // Rows of an app that counts by no caller have the caller empty.
  assert.ok(rows.every((row) => row.caller === ''))
})

test('[21-22] a call that calls another from code adds calls under both names and its processor time once, under the outer one, and so does a function that an agent calls as a tool', async (t) => {
  const { app, counted, sum } = await counting(t)
  await app.call('outer', {}, { as: system })
  const run = notDropped(await app.start('helper', { message: 'Show me the notes.' }, { as: system }))
  await app.runs.wait(run.run)
  const rows = await counted()
  assert.equal(sum(rows, 'outer', 'calls'), 1)
  assert.equal(sum(rows, 'addNote', 'calls'), 1)
  assert.equal(sum(rows, 'listNotes', 'calls'), 2)
  // The outer call held the processor for 100 ms of its own.
  assert.ok(sum(rows, 'outer', 'mainCpuMs') + sum(rows, 'outer', 'cpuMs') >= 60)
  for (const unit of ['cpuMs', 'mainCpuMs']) {
    assert.equal(sum(rows, 'addNote', unit), 0, `${unit} of a call from code`)
    assert.equal(sum(rows, 'listNotes', unit), 0, `${unit} of a tool`)
  }
  assert.equal(sum(rows, 'helper', 'runs'), 1)
  assert.ok(sum(rows, 'helper', 'steps') >= 2)
  assert.ok(sum(rows, 'helper', 'mainCpuMs') + sum(rows, 'helper', 'cpuMs') > 0)
})

test('[21-22] work on a background thread that holds the processor for a second counts a second of cpuMs, and one that took half a millisecond counts half', async (t) => {
  const { app, counted, sum } = await counting(t)
  assert.equal(await app.call('heavy', { ms: 1000 }, { as: system }), 'held')
  const long = sum(await counted(), 'heavy', 'cpuMs')
  assert.ok(long >= 750 && long <= 1400, `a second, and not ${long}`)
  assert.equal(await app.call('heavy', { ms: 0.5 }, { as: system }), 'held')
  const short = sum(await counted(), 'heavy', 'cpuMs') - long
  // The work is the half millisecond and what the engine did to carry it out: a few milliseconds at most.
  assert.ok(short > 0.3 && short < 5, `half a millisecond, and not ${short}`)
  assert.notEqual(short, Math.round(short), 'a time keeps its fractions')
})

test('[21-22] an action on the main thread that holds the processor for 100 ms, waits for a service and holds it for 100 ms more counts those 200 ms as mainCpuMs, and a call that only waited beside it counts next to none', async (t) => {
  const { app, counted, sum } = await counting(t)
  app.standIn('shipper', {
    ship: async () => {
      await new Promise((done) => setTimeout(done, 100))
      return { id: 's1' }
    },
  })
  const [done, waited] = await Promise.all([
    app.call('busy', {}, { as: system }),
    (async () => {
      await new Promise((ready) => setTimeout(ready, 120))
      return app.call('waiter', {}, { as: system })
    })(),
  ])
  assert.deepEqual([done, waited], ['done', 'waited'])
  const rows = await counted()
  const held = sum(rows, 'busy', 'mainCpuMs')
  assert.ok(held >= 180 && held <= 280, `200 ms, and not ${held}`)
  assert.ok(sum(rows, 'waiter', 'mainCpuMs') < 15, `next to none, and not ${sum(rows, 'waiter', 'mainCpuMs')}`)
  assert.equal(sum(rows, 'shipper.ship', 'calls'), 1)
})
