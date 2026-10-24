import assert from 'node:assert/strict'
import test from 'node:test'
import type { Description } from '../../core/internal.ts'
import { counts } from '../index.ts'
import { bundled, codeOf, userOf } from './apps.ts'
import { counting } from './countingApps.ts'
import { current, placeTold, rawLink, readerIn, until, worldOf, writerIn } from './machines.ts'

/** Takes the models and the agent out of the project of the counts: a world of machines makes no provider. */
const modelless = (description: Description): void => {
  for (const name of ['writer', 'shipping']) delete description.models[name]
  delete description.flows.helper
}

test("[21-22] a peak is never added: a reader's livePeak that was sent in ten batches stands as the highest, with the caller empty under countBy: 'caller' too, and the links copy and work count their bytes", async (t) => {
  const world = worldOf(t)
  const app = await writerIn(
    world,
    await bundled(
      t,
      {
        project: 'counting',
        change: (description) => {
          modelless(description)
          Object.assign(description.project, { countBy: 'caller' })
        },
      },
      world.work,
    ),
  )
  const near = await readerIn(world, 'near')
  await current(world, near)
  const raw = rawLink(app, 'o'.repeat(40))
  raw.link.send(placeTold(app, 'machine-raw'))
  await until('the raw reader was taken', () => raw.got.some((one) => one.t === 'go'))
  for (const [n, peak] of [3, 7, 5, 2, 9, 4, 1, 8, 6, 2].entries())
    raw.link.send(
      JSON.stringify({
        t: 'counted',
        start: 1000,
        n: n + 1,
        used: [{ name: 'live', answeredBy: 'machine-raw', caller: '', units: { livePeak: peak } }],
      }),
    )
  await world.beat(2)
  const rows: unknown = await app.read(counts.where({ name: 'live', unit: 'livePeak' }), { as: 'system' })
  const peaks = (Array.isArray(rows) ? rows : []).map((one) => [
    Object(one).answeredBy,
    Object(one).caller,
    Object(one).amount,
  ])
  assert.deepEqual(
    peaks.filter((one) => one[0] === 'machine-raw'),
    [['machine-raw', '', 9]],
  )
  // What the link to each reader carried is counted under copy, by its bytes, with no caller.
  for (let step = 0; step < 4; step++) await world.beat(20)
  const copied: unknown = await app.read(counts.where({ name: 'copy' }), { as: 'system' })
  const units = (Array.isArray(copied) ? copied : []).map((one) => `${Object(one).unit} ${Object(one).caller}`)
  assert.ok(units.includes('bytesOut '), JSON.stringify(units))
  assert.ok(units.includes('bytesIn '), JSON.stringify(units))
})

test('[21-22] a program reads the counts with counts as the system, from an app that shows no such table, and with another as T0013', async (t) => {
  const { app, counted } = await counting(t)
  await app.call('listNotes', {}, { as: { kind: 'system' } })
  assert.ok((await counted()).some((one) => one.name === 'listNotes'))
  assert.equal(await codeOf(app.read(counts.where({}), { as: userOf('ada') })), 'T0013')
  assert.equal(await codeOf(app.read(counts.where({}), { as: 'nobody' })), 'T0013')
})

test('[21-22] engine.program() answers what the program used: its processor time and what of it was booked to apps, its memory, the bytes of its connections and the disk of its data', async (t) => {
  const { engine, app, origin, port } = await counting(t)
  const before = engine.program()
  // A request over the network of this computer, which the connections of the program carry.
  const answer = await fetch(`http://127.0.0.1:${port}/_t/call/listNotes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: new URL(origin).host },
    body: '{"input":{}}',
  })
  await answer.text()
  await app.call('outer', {}, { as: { kind: 'system' } })
  const after = engine.program()
  assert.equal(after.id, before.id)
  assert.equal(after.since, before.since)
  assert.ok(after.upMs > before.upMs)
  assert.ok(after.cpus >= 1)
  assert.ok(after.cpuMs >= before.cpuMs && after.cpuMs > 0)
  assert.ok(after.cpuMsGiven > before.cpuMsGiven, 'the work of the calls was booked to the app')
  assert.ok(after.cpuMsGiven <= after.cpuMs)
  assert.ok(after.memoryPeak > 0)
  assert.ok(after.memoryByteSeconds >= before.memoryByteSeconds)
  assert.ok(after.bytesIn > before.bytesIn && after.bytesOut > before.bytesOut)
  assert.ok(after.diskBytes > 0)
  assert.deepEqual(Object.keys(after.children).sort(), ['cpuMs', 'memoryByteSeconds', 'memoryPeak'])
})
