import assert from 'node:assert/strict'
import { test } from 'node:test'

// The runtime sets no timer further off than this many milliseconds: one that is asked for beyond it fires at once.
const furthest = 2 ** 31 - 1

const day = 86_400_000

test('[22-20] the system clock calls a timer at its moment and never before, also one that lies further off than the runtime sets a timer, and a timer that was cancelled is never called', async (t) => {
  // The timers and the time of the runtime are stood in before the clock is loaded, so that the clock reads them.
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
  const { systemClock } = await import('../makers.ts')
  const began = systemClock.now()
  assert.equal(began, 1_000_000)
  const called: string[] = []
  // Thirty days is beyond what the runtime takes, and sixty is beyond it twice.
  systemClock.setTimer(began + 30 * day, () => called.push('thirty days'))
  systemClock.setTimer(began + 60 * day, () => called.push('sixty days'))
  systemClock.setTimer(began + 500, () => called.push('half a second'))
  const cancel = systemClock.setTimer(began + 40 * day, () => called.push('cancelled'))
  t.mock.timers.tick(1)
  assert.deepEqual(called, [], 'a timer beyond the bound of the runtime does not fire at once')
  t.mock.timers.tick(499)
  assert.deepEqual(called, ['half a second'])
  // The longest timer of the runtime ends before the moment has come: the clock sets its timer anew.
  t.mock.timers.tick(furthest)
  assert.deepEqual(called, ['half a second'])
  t.mock.timers.tick(30 * day - furthest - 501)
  assert.deepEqual(called, ['half a second'], 'one millisecond before its moment a timer is not called')
  t.mock.timers.tick(1)
  assert.deepEqual(called, ['half a second', 'thirty days'])
  // A timer that is cancelled after it was set anew is cancelled all the same.
  cancel()
  t.mock.timers.tick(30 * day - 1)
  assert.deepEqual(called, ['half a second', 'thirty days'])
  t.mock.timers.tick(1)
  assert.deepEqual(called, ['half a second', 'thirty days', 'sixty days'])
  t.mock.timers.tick(60 * day)
  assert.deepEqual(called, ['half a second', 'thirty days', 'sixty days'], 'each timer is called once')
})
