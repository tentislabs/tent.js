import assert from 'node:assert/strict'
import test from 'node:test'
import { fits, newApiKey } from '../keys/form.ts'
import { held } from '../../../rig/budgets.ts'

const randomOf = (key: string): string => key.slice(-43)

/** The time of many checks of one random part against one kept fingerprint, in milliseconds. */
function timed(random: string, kept: string | undefined): number {
  const began = performance.now()
  for (let n = 0; n < 50_000; n++) fits(random, kept)
  return performance.now() - began
}

test('[05-11.15] the check of a key takes the same time for an id of no key, for a wrong key, and for one that differs in its first or its last character', () => {
  const { key, fingerprint } = newApiKey('01m4vne21rehxa0vhe4ztfk1qx')
  const random = randomOf(key)
  const wrong = randomOf(newApiKey('01m4vne21rehxa0vhe4ztfk1qx').key)
  const first = `${random[0] === 'A' ? 'B' : 'A'}${random.slice(1)}`
  timed(wrong, fingerprint)
  // The cases are taken in turn five times and each is held by its quickest: other work on the computer only ever
  // adds time, so the quickest of a case is the nearest to the time of the check itself.
  const times = [Infinity, Infinity, Infinity]
  for (let round = 0; round < 5; round++) {
    times[0] = Math.min(times[0], timed(wrong, fingerprint))
    times[1] = Math.min(times[1], timed(wrong, undefined))
    times[2] = Math.min(times[2], timed(first, fingerprint))
  }
  held('keyForm.sameTime', (Math.max(...times) / Math.min(...times) - 1) * 100, 'percent')
  assert.equal(fits(random, fingerprint), true)
  for (const other of [wrong, first]) assert.equal(fits(other, fingerprint), false)
  assert.equal(fits(random, undefined), false)
})
