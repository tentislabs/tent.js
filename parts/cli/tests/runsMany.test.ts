import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Type } from '../../core/index.ts'
import { boolean, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { Typed } from './typed.ts'
import { copied, typed } from './typed.ts'
import { notDropped } from './started.ts'

const system = { as: 'system' } as const

// What the commands of `tent runs` over many runs print with `--json`, as their value.
const many = object({ count: number(), runs: list(text()), done: boolean(), started: list(text(), { optional: true }) })
const paused = object({ flow: text(), paused: boolean() })
const timed = object({ flow: text(), times: list(text()), runs: list(text()), done: boolean() })

/** Waits until a run stands in a state. */
async function untilState(app: App, run: string, state: string): Promise<void> {
  const ends = performance.now() + 20_000
  while (app.runs.read(run)?.state !== state) {
    assert.ok(performance.now() < ends, `the run stands at ${app.runs.read(run)?.state}, and not at ${state}`)
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
}

/** The project of these tests, built and opened by an engine of the test, with the commands of `tent runs` typed against it. */
async function opened(t: TestContext, name: string) {
  // The engine is closed before the folder of the copy is removed: the hooks of a test run in their order.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, name, 'flowJobs')
  const made = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(project, '..', 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder: data, mode: 'test' })
  const runs = async (shape: Type | undefined, ...words: string[]): Promise<Record<string, unknown>> => {
    const asked: Typed = await typed(project, 'runs', ...words, '--data', data, '--json')
    assert.equal(asked.ended, 0, asked.printed)
    if (shape) assert.deepEqual(checkValue(shape, asked.answer.value), [], `the shape of tent runs ${words.join(' ')}`)
    return Object(asked.answer.value)
  }
  return { app, project, data, runs }
}

const sorted = (ids: unknown): string[] => (Array.isArray(ids) ? ids.map(String).sort() : [])

test('[46-2] `tent runs stop` and `tent runs replay` of the runs of a flow since a moment act on exactly those, say the count first, and do nothing without --yes', async (t) => {
  const { app, runs } = await opened(t, 'runs-many')
  const start = async (name: string, breaks: boolean): Promise<string> => {
    const { run } = notDropped(await app.start('job', { name, breaks }, system))
    await untilState(app, run, breaks ? 'failed' : 'waiting')
    return run
  }
  const brokeBefore = await start('a1', true)
  const waitsBefore = await start('b1', false)
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  const since = new Date().toISOString()
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  const broke = [await start('a2', true), await start('a3', true)]
  const waits = [await start('b2', false), await start('b3', false)]

  // Without --yes the command says what it would stop, and stops nothing.
  const told = await runs(many, 'stop', '--flow', 'job', '--state', 'waiting', '--since', since)
  assert.deepEqual([told.count, sorted(told.runs), told.done], [2, [...waits].sort(), false])
  for (const run of waits) assert.equal(app.runs.read(run)?.state, 'waiting')
  const stopped = await runs(many, 'stop', '--flow', 'job', '--state', 'waiting', '--since', since, '--yes')
  assert.deepEqual([stopped.count, sorted(stopped.runs), stopped.done], [2, [...waits].sort(), true])
  for (const run of waits) assert.equal(app.runs.read(run)?.state, 'stopped')
  assert.equal(app.runs.read(waitsBefore)?.state, 'waiting', 'a run of before the moment is left')

  // The failed runs since the moment are replayed, each as `tent runs replay` replays one.
  const shown = await runs(many, 'replay', '--flow', 'job', '--state', 'failed', '--since', since, '--from', 'work')
  assert.deepEqual([shown.count, sorted(shown.runs), shown.done], [2, [...broke].sort(), false])
  assert.equal(app.runs.find({ flow: 'job' }).length, 6, 'nothing was started without --yes')
  const replayed = await runs(
    many,
    'replay',
    '--flow',
    'job',
    '--state',
    'failed',
    '--since',
    since,
    '--from',
    'work',
    '--yes',
  )
  assert.deepEqual([replayed.count, sorted(replayed.runs), replayed.done], [2, [...broke].sort(), true])
  const started = sorted(replayed.started)
  assert.equal(started.length, 2)
  assert.deepEqual(
    started.map((run) => Object(app.runs.read(run)?.input).name).sort(),
    ['a2', 'a3'],
    'a new run for each failed run since the moment, with its input',
  )
  assert.equal(app.runs.find({ flow: 'job', key: 'a1' }).length, 1, 'the run that failed before is not replayed')
  assert.equal(app.runs.read(brokeBefore)?.state, 'failed')

  // `--key` names the runs of one key, and `--before` the runs that started before a moment.
  const ofKey = await runs(many, 'stop', '--flow', 'job', '--key', 'b1', '--yes')
  assert.deepEqual([ofKey.count, ofKey.runs], [1, [waitsBefore]])
  const before = await runs(many, 'stop', '--flow', 'job', '--before', since)
  assert.deepEqual([before.count, before.done], [0, false], 'the run of before has ended now')
})

test('[46-2] `tent runs pause` keeps the starts of a flow, `tent runs` shows the paused flow first, and `tent runs resume` lets them go', async (t) => {
  const { app, project, data, runs } = await opened(t, 'runs-pause')
  assert.deepEqual(await runs(paused, 'pause', 'tick'), { flow: 'tick', paused: true })
  const { run } = notDropped(await app.start('tick', { name: 'kept' }, system))
  await new Promise<void>((resolve) => setTimeout(resolve, 50))
  assert.equal(app.runs.read(run)?.state, 'queued', 'a start of a paused flow is kept as queued')
  const listed = await runs(undefined)
  assert.deepEqual(Object.keys(listed), ['paused', 'runs'], 'the paused flows stand first')
  assert.deepEqual(listed.paused, ['tick'])
  const text = await typed(project, 'runs', '--data', data)
  assert.ok(text.printed.indexOf('tick') < text.printed.indexOf(run), text.printed)

  assert.deepEqual(await runs(paused, 'resume', 'tick'), { flow: 'tick', paused: false })
  await untilState(app, run, 'waiting')
  assert.deepEqual(Object.keys(await runs(undefined)), ['runs'], 'no flow is paused')
})

test('[46-7] `tent run <flow> --times <from> <to>` over a week of a daily flow starts seven runs with their `event.at`, in order, and `--dry` starts none', async (t) => {
  const { app, project, data } = await opened(t, 'runs-times')
  const runs = async (shape: Type, ...words: string[]): Promise<Record<string, unknown>> => {
    const asked: Typed = await typed(project, 'run', ...words, '--data', data, '--json')
    assert.equal(asked.ended, 0, asked.printed)
    assert.deepEqual(checkValue(shape, asked.answer.value), [], `the shape of tent run ${words.join(' ')}`)
    return Object(asked.answer.value)
  }
  const week = ['2031-01-01T00:00:00.000Z', '2031-01-08T00:00:00.000Z']
  const days = [1, 2, 3, 4, 5, 6, 7].map((day) => `2031-01-0${day}T09:00:00.000Z`)
  const dry = await runs(timed, 'daily', '--times', week[0], week[1], '--dry')
  assert.deepEqual(
    [dry.times, dry.runs, dry.done],
    [days, [], false],
    'the times are listed first, and nothing is started',
  )
  assert.equal(app.runs.find({ flow: 'daily' }).length, 0)
  const started = await runs(timed, 'daily', '--times', week[0], week[1])
  assert.deepEqual([started.times, started.done], [days, true])
  const ids = Array.isArray(started.runs) ? started.runs.map(String) : []
  assert.equal(ids.length, 7)
  const answers = await Promise.all(ids.map((run) => app.runs.wait(run)))
  assert.deepEqual(answers, days, 'each run is handed its time as `event.at`, and they were started in its order')
  assert.equal(app.runs.find({ flow: 'daily' }).length, 7)
})
