import assert from 'node:assert/strict'
import { test } from 'node:test'
import { testClock } from './apps.ts'
import { flowing, settle, started, untilState } from './flowing.ts'

const day = 86_400_000

/** Holds the program for a while with work of its own, as a long stretch of other work does. Answers its turns. */
function held(ms: number): number {
  const ends = performance.now() + ms
  let turns = 0
  while (performance.now() < ends) turns += 1
  return turns
}

test('[23-9] a run that its wait wakes while the program is held by other work goes on: the work between two steps counts from when its pass takes the answer', async (t) => {
  const clock = testClock()
  const { app } = await flowing(t, { clock })
  const waiting = await started(app, 'waitsForPerson')
  await untilState(app, waiting, 'waiting')
  // The wait ends at seven days; an hour later the program is held past `limits.pass` before its pass takes the answer.
  clock.clock.setTimer(clock.clock.now() + 7 * day + 3_600_000, () => void held(6000))
  clock.advance(8 * day)
  await settle()
  await untilState(app, waiting, 'done')
  assert.deepEqual(app.runs.read(waiting)?.answer, { timedOut: true })
})
