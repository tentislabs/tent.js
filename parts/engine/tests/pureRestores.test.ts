import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pure } from '../rooms/pure.ts'

test('[53-20] a query swapped by pure puts back the Date and the Math.random that stood before its swap: those of the test, never those of the runtime', () => {
  const [runtimeDate, runtimeRandom] = [globalThis.Date, Math.random]
  // What a test stood in place of the runtime's own, after the engine was loaded.
  const ownDate = new Proxy(runtimeDate, {})
  const ownRandom = (): number => 0.5
  globalThis.Date = ownDate
  Math.random = ownRandom
  try {
    assert.throws(() => pure(() => Date.now()), { code: 'T4101' })
    assert.throws(() => pure(() => Math.random()), { code: 'T4101' })
    // Swaps one inside another put back the test's own once the last ends.
    pure(() => pure(() => undefined))
    assert.equal(globalThis.Date, ownDate)
    assert.equal(Math.random, ownRandom)
  } finally {
    globalThis.Date = runtimeDate
    Math.random = runtimeRandom
  }
})
