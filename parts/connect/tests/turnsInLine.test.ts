import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConnectEnv } from '../env.ts'
import { guardedFetch } from '../guardedFetch.ts'
import { turnsOf } from '../turns.ts'

/** What the turns of a service are handed: a clock that stands, and nothing else they ask. */
const env: ConnectEnv = {
  description: () => {
    throw new Error('no description in this test')
  },
  fetch: guardedFetch({ mode: 'development' }),
  secret: () => '',
  tokens: { read: () => undefined, write: () => undefined },
  signers: {},
  verifiers: {},
  once: () => undefined,
  files: {
    stream: async () => new Blob([]).stream(),
    info: () => ({ name: 'none', kind: 'text/plain', size: 0 }),
    put: async () => 'f1',
  },
  logged: () => undefined,
  now: () => Date.UTC(2032, 0, 1),
  sleep: async () => undefined,
}

test('[24-4] under `atOnce: 1` a freed place goes to the call that waits for it, and not to a call that comes after it', async () => {
  const turns = turnsOf(env, { atOnce: 1 })
  const signal = new AbortController().signal
  const first = await turns.take(signal)
  const order: string[] = []
  const waits = turns.take(signal).then((done) => {
    order.push('waits')
    return done
  })
  await new Promise((done) => setImmediate(done))
  first()
  // A call that starts before the woken one runs again finds the place taken.
  const later = turns.take(signal).then((done) => {
    order.push('later')
    return done
  })
  await new Promise((done) => setImmediate(done))
  assert.deepEqual(order, ['waits'])
  ;(await waits)()
  ;(await later)()
  assert.deepEqual(order, ['waits', 'later'])
})
