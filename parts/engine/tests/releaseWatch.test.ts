import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openedOf } from '../app.ts'
import type { ReleaseView } from '../gradual/release.ts'
import { beginRelease, releaseCounted, releaseOf, watchOf } from '../gradual/release.ts'
import type { Opened } from '../opened.ts'
import { running } from './apps.ts'

/**
 * Begins a release on an app with a watch that needs three calls of each version, counts three calls of the old
 * version and three of the new one at the times given, and answers how the release stands and what was told of it.
 */
function watched(o: Opened, times: { old: number; now: number }, slowerBy?: number): ReleaseView {
  const told: ReleaseView[] = []
  const watch = watchOf({ calls: 3, ...(slowerBy === undefined ? {} : { slowerBy }) })
  beginRelease(o, 'next', { steps: [0.5, 1], every: 3_600_000, watch, told: (one) => told.push(one) }, async () => {})
  const newer: Opened = Object.assign(Object.create(Object.getPrototypeOf(o)), o, { version: 'next' })
  for (let n = 0; n < 3; n++) {
    releaseCounted(o, times.old, false)
    releaseCounted(newer, times.now, false)
  }
  return told.at(-1) ?? releaseOf(o) ?? assert.fail('a release goes')
}

test('[54-7] a release whose new version answers at 1.4 ms at the 95th share against 0.9 ms is widened, one at 40 ms against 10 ms is taken back naming both times to a tenth of a millisecond, and with slowerBy 0 ms the first is taken back', async (t) => {
  const { app } = await running(t)
  const o = openedOf(app) ?? assert.fail('the app is held here')
  // A difference under five milliseconds is no reason, however large its share.
  assert.equal(watched(o, { old: 0.9, now: 1.4 }).state, 'going')
  const slow = watched(o, { old: 10, now: 40 })
  assert.equal(slow.state, 'back')
  assert.match(String(slow.why), /40\.0 ms .* 10\.0 ms/)
  const strict = watched(o, { old: 0.9, now: 1.4 }, 0)
  assert.equal(strict.state, 'back')
  assert.match(String(strict.why), /1\.4 ms .* 0\.9 ms/)
})

test('[54-7] the watch of a release takes five milliseconds as the time a new version must be slower by, where none is stated', () => {
  assert.deepEqual(watchOf({}), { failures: 0.01, slower: 0.2, slowerBy: 5, calls: 200 })
  assert.equal(watchOf({ slowerBy: 0 }).slowerBy, 0)
})
