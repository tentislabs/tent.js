import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prefetchOf } from '../page/prefetch.ts'
import type { Reach } from '../page/reach.ts'
import type { Page } from '../page/types.ts'

// A link that is pointed at asks for its screen at once, and does the rest once the browser is idle:
// what comes back, and the files of the screen, are taken in then, and not between the pointer and the press.

test('[32-6] a screen prefetched is asked for at once, and what its answer brings is taken in when the browser is idle', async () => {
  // What the browser does once it is idle, held until the test says it is.
  const idle: (() => void)[] = []
  const asked: string[] = []
  const answer = { ok: true, value: { screen: 'shopScreen' } }
  const reach: Reach = {
    post: async () => undefined,
    go: () => undefined,
    idle: (work) => void idle.push(work),
    get: async (address) => {
      asked.push(address)
      return answer
    },
  }
  const came: unknown[] = []
  const shown = (): Page => Object({ version: 'v1' })
  const prefetched = prefetchOf(reach, shown, (one) => void came.push(one))
  prefetched.fetch('/shop', 'v1')
  // The ask goes out with the pointer: that must be done at once.
  assert.equal(asked.length, 1)
  assert.match(String(asked[0]), /^\/_t\/screen\?path=%2Fshop/)
  // Its answer is there, and nothing is taken in yet: the browser has not been idle.
  assert.deepEqual(await prefetched.take('/shop'), answer)
  await new Promise((done) => setTimeout(done, 10))
  assert.deepEqual(came, [])
  assert.equal(idle.length, 1)
  // Once the browser is idle, the answer is taken in, and the files of its screen are loaded from there.
  for (const work of idle.splice(0)) work()
  assert.deepEqual(came, [answer])
})
