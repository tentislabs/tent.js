import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { addUser, bundled, codeOf, engineOf, system, testClock, workFolder } from './apps.ts'
import { flowing, marksOf, settle, started, untilState } from './flowing.ts'

const project = 'moreFlows'

test('[46-2] `runs.stopAll` and `runs.replayAll` in code act on exactly the runs that fit, and answer their count', async (t) => {
  const { app, advance, now } = await flowing(t, { project })
  const start = async (name: string, breaks: boolean): Promise<string> => {
    const run = await started(app, 'job', { name, breaks })
    await untilState(app, run, breaks ? 'failed' : 'waiting')
    return run
  }
  const brokeBefore = await start('a1', true)
  const waitsBefore = await start('b1', false)
  advance(60_000)
  const since = now()
  const broke = [await start('a2', true), await start('a3', true)]
  const waits = [await start('b2', false), await start('b3', false)]

  const stopped = Object(await app.call('stopJobs', { state: 'waiting', since }, { as: system }))
  assert.deepEqual([stopped.count, [...stopped.runs].sort()], [2, [...waits].sort()])
  for (const run of waits) assert.equal(app.runs.read(run)?.state, 'stopped')
  assert.equal(app.runs.read(waitsBefore)?.state, 'waiting')

  const replayed = Object(await app.call('replayJobs', { state: 'failed', since }, { as: system }))
  assert.deepEqual([replayed.count, [...replayed.runs].sort()], [2, [...broke].sort()])
  assert.equal(replayed.started.length, 2)
  assert.deepEqual(replayed.started.map((run: string) => Object(app.runs.read(run)?.input).name).sort(), ['a2', 'a3'])
  assert.equal(app.runs.read(brokeBefore)?.state, 'failed')
  assert.equal(app.runs.find({ flow: 'job', key: 'a1' }).length, 1, 'the run that failed before is not replayed')

  // The two are full access: code that states no `system` is refused.
  const ada = await addUser(app, 'Ada')
  assert.equal(await codeOf(app.call('stopJobsUnheld', {}, { as: ada })), 'T0013')
  assert.equal(app.runs.read(waitsBefore)?.state, 'waiting')
})

test('[46-2] a paused flow keeps its starts and its due runs across a restart, and `resume` lets them go in their order', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, { project }, work)
  const dataFolder = join(work, 'data')
  const { clock, advance } = testClock()
  const first = engineOf(t, { makers: { clock: () => clock } })
  const app = await first.open(bundle.folder, { dataFolder, mode: 'test' })
  const waited = await started(app, 'tick', { name: 't1' })
  await untilState(app, waited, 'waiting')
  app.runs.pause('tick')
  const kept = [await started(app, 'tick', { name: 't2' }), await started(app, 'tick', { name: 't3' })]
  advance(3_600_000)
  await settle()
  assert.deepEqual(
    [waited, ...kept].map((run) => app.runs.read(run)?.state),
    ['waiting', 'queued', 'queued'],
    'a start is kept, and a run whose time came stays waiting',
  )
  assert.deepEqual(await marksOf(app), ['before t1'])
  await first.close()

  const second = engineOf(t, { makers: { clock: () => clock } })
  const again = await second.open(bundle.folder, { dataFolder, mode: 'test' })
  await settle()
  assert.deepEqual(again.runs.paused(), ['tick'], 'the pause holds across a restart')
  assert.deepEqual(
    [waited, ...kept].map((run) => again.runs.read(run)?.state),
    ['waiting', 'queued', 'queued'],
  )
  assert.deepEqual(await marksOf(again), ['before t1'])

  again.runs.resume('tick')
  assert.deepEqual(again.runs.paused(), [])
  await untilState(again, waited, 'done')
  for (const run of kept) await untilState(again, run, 'waiting')
  assert.deepEqual(await marksOf(again), ['before t1', 'after t1', 'before t2', 'before t3'], 'they go in their order')
})
