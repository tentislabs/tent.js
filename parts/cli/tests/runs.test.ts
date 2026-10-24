import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Type } from '../../core/index.ts'
import { boolean, json, list, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { Typed } from './typed.ts'
import { copied, typed } from './typed.ts'
import { notDropped } from './started.ts'

const system = { as: 'system' } as const

const line = object({
  id: text(),
  flow: text(),
  state: text(),
  version: text(),
  step: text({ optional: true }),
  error: text({ optional: true }),
})

// What each command of `tent runs` prints with `--json`, as its value.
const shapes: Record<string, Type> = {
  list: object({ runs: list(line) }),
  show: json(),
  replay: object({ run: text(), from: text(), of: text() }),
  move: object({ run: text(), version: text(), moved: boolean(), step: text({ optional: true }) }),
  approve: object({ run: text(), step: text(), approved: boolean() }),
  refuse: object({ run: text(), step: text(), approved: boolean() }),
  stop: object({ run: text(), state: text() }),
}

/** Waits until a run stands in a state. */
async function untilState(app: App, run: string, state: string): Promise<void> {
  const ends = performance.now() + 20_000
  while (app.runs.read(run)?.state !== state) {
    assert.ok(performance.now() < ends, `the run stands at ${app.runs.read(run)?.state}, and not at ${state}`)
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
}

/** Builds a copy of the project of these tests, after a change to the file of its flow where one is given. */
async function built(t: TestContext, name: string, change?: (written: string) => string) {
  const project = copied(t, name, 'flowShop')
  const file = join(project, 'flows', 'orders.ts')
  if (change) writeFileSync(file, change(readFileSync(file, 'utf8')))
  const made = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  return { project, ...made }
}

/** The app of the first copy, opened by an engine of the test, and the commands of `tent runs` typed against it. */
async function opened(t: TestContext, name: string) {
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const one = await built(t, name)
  const data = join(one.project, '..', 'data')
  const app = await engine.open(one.bundleFolder, { dataFolder: data, mode: 'test' })
  const runs = async (...words: string[]): Promise<Typed> => {
    const asked = await typed(one.project, 'runs', ...words, '--data', data, '--json')
    // Each answer that is no refusal has the stored shape of its command.
    if (asked.ended === 0)
      assert.deepEqual(
        checkValue(shapes[words[0] ?? 'list'], asked.answer.value),
        [],
        `the shape of tent runs ${words[0] ?? ''}`,
      )
    return asked
  }
  /** Starts a run of the flow, and answers its id once it waits for its yes. */
  const waiting = async (title: string): Promise<string> => {
    const { run } = notDropped(await app.start('bigOrder', { title }, system))
    await untilState(app, run, 'waiting')
    return run
  }
  /** The value that a command answered, which must have ended with 0. */
  const value = (asked: Typed): Record<string, unknown> => {
    assert.equal(asked.ended, 0, asked.printed)
    assert.deepEqual([asked.answer.ok, asked.answer.findings], [true, []])
    return Object(asked.answer.value)
  }
  return { app, one, data, runs, waiting, value }
}

test('[15-6@7b] `tent runs` lists the runs, `runs show` prints one in full, `runs approve`, `runs refuse` and `runs stop` answer and end a run, and a run that is not there is T0001', async (t) => {
  const { app, one, data, runs, waiting, value } = await opened(t, 'runs-commands')
  // An app with no run yet lists none.
  assert.deepEqual(value(await runs()), { runs: [] })

  const first = await waiting('desk')
  assert.deepEqual(value(await runs()), {
    runs: [{ id: first, flow: 'bigOrder', state: 'waiting', version: one.versionId, step: 'approval' }],
  })
  const shown = value(await runs('show', first))
  assert.deepEqual(
    [shown.id, shown.flow, shown.state, shown.version, shown.input],
    [first, 'bigOrder', 'waiting', one.versionId, { title: 'desk' }],
  )
  assert.deepEqual(
    Object(shown.steps).map((step: { name: string; state: string }) => [step.name, step.state]),
    [
      ['tell sales', 'done'],
      ['approval', 'waiting'],
    ],
  )

  // A no: the run goes on, and its flow reads it.
  assert.deepEqual(value(await runs('refuse', first, 'approval')), { run: first, step: 'approval', approved: false })
  assert.match(String(await app.runs.wait(first)), /^desk \S+ no \S+$/)
  // A second answer to a step that was answered is refused, and so is a step that the run does not wait at.
  const again = await runs('approve', first, 'approval')
  assert.deepEqual([again.ended, again.answer.findings?.[0].code], [1, 'T0002'], again.printed)

  const second = await waiting('lamp')
  assert.deepEqual(value(await runs('approve', second, 'approval')), { run: second, step: 'approval', approved: true })
  assert.match(String(await app.runs.wait(second)), /^lamp \S+ yes \S+$/)

  const third = await waiting('chair')
  assert.deepEqual(value(await runs('stop', third)), { run: third, state: 'stopped' })
  assert.equal(app.runs.read(third)?.state, 'stopped')
  // The newest run stands first.
  assert.deepEqual(
    Object(value(await runs()).runs).map((run: { id: string; state: string }) => [run.id, run.state]),
    [
      [third, 'stopped'],
      [second, 'done'],
      [first, 'done'],
    ],
  )

  // A run that is not there, for each command that names one.
  for (const words of [
    ['show', 'nothere'],
    ['stop', 'nothere'],
    ['move', 'nothere'],
    ['approve', 'nothere', 'approval'],
  ]) {
    const none = await runs(...words)
    assert.deepEqual([none.ended, none.answer.findings?.[0].code], [1, 'T0001'], words.join(' '))
    assert.match(String(none.answer.findings?.[0].message), /nothere/)
  }
  const fromless = await runs('replay', second)
  assert.equal(fromless.ended, 2, 'a replay that names no step is a command typed wrong')
  assert.match(fromless.printed, /from/)

  // As text, the list prints each run with its id, its flow and its state.
  const text = await typed(one.project, 'runs', '--data', data)
  assert.equal(text.ended, 0)
  for (const piece of [first, second, third, 'bigOrder', 'stopped']) assert.ok(text.printed.includes(piece), piece)
})

test('[23-23] `tent runs replay` starts a new run on the live version that reuses the saved results before the named step', async (t) => {
  const { app, one, runs, waiting, value } = await opened(t, 'runs-replay')
  const run = await waiting('desk')
  app.runs.approve(run, 'approval')
  const answer = String(await app.runs.wait(run))
  const [, told, sent] = /^desk (\S+) yes (\S+)$/.exec(answer) ?? []
  assert.ok(told && sent, answer)

  // Another version runs when the replay is asked for: the new run is a run of that one.
  const two = await built(t, 'runs-replay-two', (written) =>
    written.replace(
      'input: { title: text() },',
      "about: 'An order that waits for a yes.',\n  input: { title: text() },",
    ),
  )
  assert.notEqual(two.versionId, one.versionId)
  await app.switch(await app.add(two.bundleFolder))

  const replayed = value(await runs('replay', run, '--from', 'send'))
  assert.deepEqual([replayed.of, replayed.from], [run, 'send'])
  const next = String(replayed.run)
  assert.notEqual(next, run)
  const again = /^desk (\S+) yes (\S+)$/.exec(String(await app.runs.wait(next))) ?? []
  // The step before the named one answers what the first run saved, and the wait its yes: neither is carried out anew.
  assert.equal(again[1], told)
  // The named step is carried out, and draws a token of its own.
  assert.ok(again[2] && again[2] !== sent)
  const view = app.runs.read(next)
  assert.deepEqual([view?.version, view?.state, view?.input], [two.versionId, 'done', { title: 'desk' }])
  assert.deepEqual(
    view?.steps.map((step) => [step.name, step.state]),
    [
      ['tell sales', 'done'],
      ['approval', 'done'],
      ['send', 'done'],
    ],
  )
  // The first run is as it was.
  assert.deepEqual([app.runs.read(run)?.version, app.runs.read(run)?.answer], [one.versionId, answer])

  // A step that the run never saved names nothing to begin at.
  const none = await runs('replay', run, '--from', 'nothere')
  assert.equal(none.ended, 1, none.printed)
  assert.match(String(none.answer.findings?.[0].message), /nothere/)
})

test('[23-23] `tent runs move` moves a waiting run to the live version when its steps still match, and leaves it and names the step when one was renamed', async (t) => {
  const { app, one, data, runs, waiting, value } = await opened(t, 'runs-move')
  const run = await waiting('desk')
  // The flow states no `moveRuns`, so a switch leaves its waiting run on the version it started with.
  const two = await built(t, 'runs-move-two', (written) =>
    written.replace(
      'input: { title: text() },',
      "about: 'An order that waits for a yes.',\n  input: { title: text() },",
    ),
  )
  await app.switch(await app.add(two.bundleFolder))
  assert.equal(app.runs.read(run)?.version, one.versionId)
  assert.deepEqual(value(await runs('move', run)), { run, version: two.versionId, moved: true })
  assert.equal(app.runs.read(run)?.version, two.versionId)

  // In a third version the step that the run saved carries another name.
  const three = await built(t, 'runs-move-three', (written) =>
    written.replace("step('tell sales'", "step('tell the team'"),
  )
  await app.switch(await app.add(three.bundleFolder))
  assert.deepEqual(value(await runs('move', run)), { run, version: three.versionId, moved: false, step: 'tell sales' })
  assert.equal(app.runs.read(run)?.version, two.versionId)
  // The check of the third project, held against the data of the running app, says beforehand what the move found.
  const checked = await typed(three.project, 'check', '--data', data, '--json')
  const gone = (checked.answer.findings ?? []).filter((one) => one.code === 'T5003')
  assert.deepEqual(
    gone.map((one) => [one.level, one.where?.definition]),
    [['warning', 'bigOrder']],
    checked.printed,
  )
  assert.match(gone[0].message, /`tell sales`, which is gone or renamed/)
  assert.equal(checked.ended, 0, 'a warning refuses nothing')
  assert.deepEqual((await typed(two.project, 'check', '--data', data, '--json')).answer.findings, [])
  // The run ends on the version it kept.
  app.runs.approve(run, 'approval')
  assert.match(String(await app.runs.wait(run)), /^desk \S+ yes \S+$/)
})
