import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codeOf, refusal, system } from './apps.ts'
import { flowing, marksOf, settle, started, untilWithin, untilState } from './flowing.ts'

const day = 86_400_000

test('[23-9] [16-2@7b] each limit that has an error gives it, and a flow that states a larger limit passes it', async (t) => {
  const { app } = await flowing(t)
  /** The error that a run of a flow failed with. */
  const failure = async (flow: string, input?: unknown) => refusal(app.runs.wait(await started(app, flow, input)))

  // Steps for each run: 1,000 where the flow states nothing.
  const steps = await failure('manySteps', { count: 1001 })
  assert.equal(steps.code, 'T5101')
  assert.match(steps.message, /`limits\.steps` of 1000/, 'the error names the limit')
  assert.match(String(steps.fix), /limits\.steps/, 'and the fix')
  assert.equal(await app.runs.wait(await started(app, 'manySteps', { count: 1000 })), 1000)
  assert.equal(await app.runs.wait(await started(app, 'moreSteps', { count: 1001 })), 1001)

  // The size of the answer of a flow, and of the result of one step: 1 MB.
  assert.equal((await failure('largeAnswer')).code, 'T5102')
  assert.equal(await app.runs.wait(await started(app, 'largerAnswer')), true)
  const large = await started(app, 'largeResult')
  await untilState(app, large, 'failed')
  assert.equal(app.runs.read(large)?.steps[0].error?.code, 'T5102', 'the step whose result is too large has failed')

  // The longest wait: one year.
  const wait = await failure('longWait')
  assert.equal(wait.code, 'T5103')
  const waits = await started(app, 'longerWait')
  await untilState(app, waits, 'waiting')

  // The longest work between two steps, and the longest run.
  const pass = await failure('slowPass')
  assert.equal(pass.code, 'T5104')
  assert.match(pass.message, /`limits\.pass`/)
  assert.equal(await app.runs.wait(await started(app, 'slowerPass')), 2)
  const run = await failure('longRun')
  assert.equal(run.code, 'T5104')
  assert.match(run.message, /`limits\.time`/)
  assert.equal(await app.runs.wait(await started(app, 'longerRun')), 2)
})

test('[23-9] [16-2@7b] a run over `together` only waits, a flow that states `then: refuse` refuses one more with T7103, and `runsKept` only removes', async (t) => {
  const { app, advance } = await flowing(t)
  const first = await started(app, 'oneAtATime', { name: 'first' })
  const second = await started(app, 'oneAtATime', { name: 'second' })
  const third = await started(app, 'oneAtATime', { name: 'third' })
  await untilWithin(() => app.runs.read(first)?.steps[0]?.state === 'started', 'the first run works')
  await settle()
  // One run of the flow works, and the two others wait their turn: that is no error.
  assert.deepEqual(
    [first, second, third].map((run) => app.runs.read(run)?.state),
    ['running', 'queued', 'queued'],
  )
  await app.call('addMark', { what: 'go second' }, { as: system })
  await app.call('addMark', { what: 'go third' }, { as: system })
  await settle()
  assert.equal(app.runs.read(second)?.state, 'queued', 'the second waits for the first, though it could end at once')
  await app.call('addMark', { what: 'go first' }, { as: system })
  assert.deepEqual(await Promise.all([first, second, third].map((run) => app.runs.wait(run))), [
    'first',
    'second',
    'third',
  ])

  // With `then: 'refuse'` one run more is refused when it is started.
  const held = await started(app, 'refusesMore', { name: 'held' })
  await untilWithin(() => app.runs.read(held)?.steps[0]?.state === 'started', 'the run works')
  const refused = await refusal(app.start('refusesMore', { name: 'more' }, { as: system }))
  assert.equal(refused.code, 'T7103')
  assert.equal(app.runs.find({ flow: 'refusesMore' }).length, 1, 'no run was added for the start that was refused')
  await app.call('addMark', { what: 'go held' }, { as: system })
  assert.equal(await app.runs.wait(held), 'held')

  // Finished runs are kept for `runsKept`, 30 days, and then removed on the daily beat of the upkeep.
  const waiting = await started(app, 'waitsForPerson')
  await untilState(app, waiting, 'waiting')
  advance(29 * day)
  await settle()
  assert.ok(app.runs.read(first), 'after 29 days a finished run is still there')
  advance(2 * day)
  await settle()
  assert.equal(app.runs.read(first), undefined, 'after 31 days it is removed')
  assert.deepEqual(app.runs.find({ flow: 'oneAtATime' }), [])
  assert.equal(
    app.runs.read(waiting)?.state,
    'done',
    'a run that had not ended was not removed: its wait ended at its time',
  )
  assert.deepEqual(app.runs.read(waiting)?.answer, { timedOut: true })
  assert.equal(await codeOf(app.runs.wait(first)), 'T0001')
  const marks = await marksOf(app)
  assert.equal(marks.filter((mark) => mark.startsWith('go ')).length, 4, 'nothing but runs was removed')
  // Meanwhile the schedule of the app fired at nine each morning, once a day, with the moment it was due.
  const daily = marks.filter((mark) => mark.startsWith('daily '))
  assert.equal(daily.length, 31)
  assert.equal(daily[0], 'daily 2031-01-01T09:00:00.000Z')
  assert.equal(daily[30], 'daily 2031-01-31T09:00:00.000Z')
})
