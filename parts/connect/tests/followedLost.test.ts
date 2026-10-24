import assert from 'node:assert/strict'
import test from 'node:test'
import { followed } from '../cli/followed.ts'
import type { Reach } from '../env.ts'

test('[24-14] a run that is followed ends with a failure where nothing at all arrived on its live connection for 45 seconds, as a page takes it as lost', {
  timeout: 10_000,
}, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let told: (message: object) => void = () => undefined
  const reach: Reach = {
    request: async () => Response.json({}),
    live: async () => ({
      send: () => undefined,
      each: (fn) => {
        told = fn
      },
      close: () => undefined,
    }),
  }
  const parts = followed(reach, 'r1')[Symbol.asyncIterator]()
  const next = parts.next().then(
    () => 'a part',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
  for (let k = 0; k < 5; k++) await Promise.resolve()
  // A sign of life keeps the connection: the 45 seconds count again from it.
  t.mock.timers.tick(40_000)
  told({ t: 'alive' })
  for (let k = 0; k < 5; k++) await Promise.resolve()
  t.mock.timers.tick(40_000)
  for (let k = 0; k < 5; k++) await Promise.resolve()
  t.mock.timers.tick(5_000)
  assert.match(await next, /lost/)
})
