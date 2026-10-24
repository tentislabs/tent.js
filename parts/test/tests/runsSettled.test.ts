import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { notDropped } from './started.ts'

const system = { as: { kind: 'system' } } as const

test('[17-1@10f] `app.settled()` answers once no run is queued or working: each is done, or waits for a time or a person', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'settling') })
  closing(t, () => app.close())
  const marks = async (): Promise<string[]> =>
    [await app.call('allMarks', {}, system)]
      .flat()
      .map((row: unknown) => String(Object(row).what))
      .sort()
  const state = (run: string): string | undefined => app.runs.read(run)?.state
  const later = notDropped(await app.start('later', undefined, system)).run
  const asks = notDropped(await app.start('asks', undefined, system)).run
  const slow = notDropped(await app.start('slow', undefined, system)).run

  await app.settled()
  assert.deepEqual(
    [state(later), state(asks), state(slow)],
    ['waiting', 'waiting', 'done'],
    'the slow one was waited for',
  )
  assert.deepEqual(await marks(), ['first', 'slow'])

  app.clock.advance('1 hour')
  await app.settled()
  assert.equal(state(later), 'done', 'a wait that came due goes on before it answers')
  assert.deepEqual(await marks(), ['first', 'second', 'slow'])

  app.runs.approve(asks, 'approval')
  await app.settled()
  assert.equal(state(asks), 'done')
  assert.deepEqual(await marks(), ['approved true', 'first', 'second', 'slow'])
})

test('[17-1@10f] `app.restart()` opens the same data again, and a run that waited goes on there', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'settling') })
  closing(t, () => app.close())
  const later = notDropped(await app.start('later', undefined, system)).run
  await app.settled()
  await app.restart()
  assert.equal(app.runs.read(later)?.state, 'waiting')
  app.clock.advance('1 hour')
  await app.settled()
  assert.equal(app.runs.read(later)?.state, 'done')
})
