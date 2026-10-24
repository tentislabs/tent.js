import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { bundled, engineOf, portOf, testClock, workFolder } from './apps.ts'
import { untilWithin } from './flowing.ts'

const minutes = (n: number): number => n * 60_000

/** A call of the app over the network, and the code of its error where it is one. */
async function called(port: number): Promise<{ status: number; code?: string }> {
  const answer = await fetch(`http://localhost:${port}/_t/call/allMarks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"input":{}}',
  })
  const body = Object(await answer.json())
  return { status: answer.status, ...(body.ok === false ? { code: String(Object(body.error).code) } : {}) }
}

test('[21-24] a request that arrives during a waking waits within web.openTime, and is answered T0008 past it; one after the waking is answered', async (t) => {
  const bundle = await bundled(t, { project: 'sleepy' })
  const { clock, advance } = testClock()
  // The waking waits for the first yes of the lease, which the test holds back for a second and a half.
  let slow = false
  const lease = {
    hold: async () => {
      if (slow) await new Promise((done) => setTimeout(done, 1500))
      return true
    },
  }
  const heard: string[] = []
  const engine = engineOf(t, { makers: { clock: () => clock, lease: () => lease }, web: { openTime: '200 ms' } })
  engine.on('app.asleep', () => void heard.push('asleep'))
  engine.on('app.woke', () => void heard.push('woke'))
  const dataFolder = join(workFolder(t), 'data')
  await engine.open(bundle.folder, { dataFolder, mode: 'test', sleepAfter: '10 minutes' })
  const port = portOf(dataFolder)
  advance(minutes(11))
  await untilWithin(() => heard.length === 1, 'the app fell asleep')
  slow = true
  const began = performance.now()
  const first = await called(port)
  assert.deepEqual(first, { status: 500, code: 'T0008' })
  assert.ok(performance.now() - began < 1400, 'the request waited past web.openTime')
  await untilWithin(() => heard.includes('woke'), 'the waking ended')
  assert.equal((await called(port)).status, 200)
})
