import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { ColumnType, TableLayout } from '../../data/index.ts'
import { applySteps, sqliteStore } from '../../data/index.ts'
import { addUser, bundled, engineOf, logRows, refusal, system, workFolder } from './apps.ts'
import { flowing, settle, started, untilWithin, untilState } from './flowing.ts'

const project = 'moreFlows'

test('[46-1] three starts of one key with `then: join` make one run, each start is answered that run, and the log counts each join', async (t) => {
  const { app, dataFolder } = await flowing(t, { project })
  const first = await started(app, 'ship', { order: 'o1' })
  const again = await started(app, 'ship', { order: 'o1' })
  const thrice: unknown = await app.call('shipThrice', { order: 'o1' }, { as: system })
  assert.equal(again, first, 'a second start of the key is answered the run under way')
  assert.deepEqual(thrice, [first, first, first], 'the starts from code join it too')
  assert.equal(app.runs.find({ flow: 'ship' }).length, 1, 'one run, for five starts')
  assert.equal(app.runs.read(first)?.key, 'o1', 'the run keeps its key')
  const other = await started(app, 'ship', { order: 'o2' })
  assert.notEqual(other, first, 'another key is another run')
  const joins = logRows(dataFolder, 'lines').filter((row) => String(row.message).includes('joined'))
  assert.equal(joins.length, 4, 'each start that joined is a line of the log')
  assert.match(String(joins[0].data), new RegExp(first))

  // Once the run of the key has ended, the next start of it starts a new run.
  await untilState(app, first, 'waiting')
  app.runs.approve(first, 'handed over')
  assert.equal(await app.runs.wait(first), 'shipped o1')
  const after = await started(app, 'ship', { order: 'o1' })
  assert.notEqual(after, first)
})

test('[46-1] a join answers the run to its starter and to code with full access, and to another caller it starts nothing', async (t) => {
  const { app } = await flowing(t, { project })
  const ada = await addUser(app, 'Ada')
  const bob = await addUser(app, 'Bob')
  const theirs = await started(app, 'ship', { order: 'o1' }, ada)
  assert.equal(await started(app, 'ship', { order: 'o1' }, ada), theirs, 'the starter is answered its run')
  assert.equal(await started(app, 'ship', { order: 'o1' }), theirs, 'the system is answered it')
  const refused = await refusal(app.start('ship', { order: 'o1' }, { as: bob }))
  assert.equal(refused.code, 'T7103')
  assert.doesNotMatch(refused.message, new RegExp(theirs), 'the refusal names nothing of the run')
  assert.equal(app.runs.find({ flow: 'ship' }).length, 1, 'nothing was started for the other caller')
})

test('[46-1] `stopOn` stops the runs of the key in the write that emits, and no run of another key', async (t) => {
  const { app } = await flowing(t, { project })
  const one = await started(app, 'ship', { order: 'o1' })
  const two = await started(app, 'ship', { order: 'o2' })
  await untilState(app, one, 'waiting')
  await untilState(app, two, 'waiting')

  // A cancel that fails after its event is undone whole: its event stops nothing.
  assert.equal((await refusal(app.call('cancelAndFail', { order: 'o1' }, { as: system }))).code, 'kept')
  await settle()
  assert.equal(app.runs.read(one)?.state, 'waiting')

  await app.call('cancel', { order: 'o1' }, { as: system })
  assert.equal(app.runs.read(one)?.state, 'stopped', 'the run is stopped once the write that emitted has ended')
  assert.equal(app.runs.read(two)?.state, 'waiting', 'the run of another key goes on')
  assert.equal((await refusal(app.runs.wait(one))).code, 'T5106')
  // A start of the key after the stop starts a new run.
  assert.notEqual(await started(app, 'ship', { order: 'o1' }), one)
})

test('[46-1] `runs.find({ flow, key })` finds the runs of a key, with `states` and `since`', async (t) => {
  const { app, advance, now } = await flowing(t, { project })
  const one = await started(app, 'ship', { order: 'o1' })
  await untilState(app, one, 'waiting')
  await app.call('cancel', { order: 'o1' }, { as: system })
  advance(60_000)
  const since = now()
  const two = await started(app, 'ship', { order: 'o1' })
  const other = await started(app, 'ship', { order: 'o2' })
  await untilState(app, two, 'waiting')
  await untilState(app, other, 'waiting')

  const ids = (found: { id: string }[]): string[] => found.map((run) => run.id).sort()
  assert.deepEqual(ids(app.runs.find({ flow: 'ship', key: 'o1' })), [one, two].sort())
  assert.deepEqual(ids(app.runs.find({ flow: 'ship', key: 'o1', states: ['stopped'] })), [one])
  assert.deepEqual(ids(app.runs.find({ flow: 'ship', key: 'o1', since })), [two])
  assert.deepEqual(ids(app.runs.find({ key: 'o2' })), [other])
  const found: unknown = await app.call('runsOfOrder', { order: 'o1' }, { as: system })
  assert.deepEqual(
    Array.isArray(found) ? found.map(String).sort() : found,
    [one, two].sort(),
    'the handle finds them too',
  )
})

test('[46-1] a shared limit of five over two flows holds five runs for one team, and lets the run of another team go', async (t) => {
  const { app } = await flowing(t, { project })
  const ofA = [
    await started(app, 'teamReport', { team: 'a', name: 'a1' }),
    await started(app, 'teamExport', { team: 'a', name: 'a2' }),
    await started(app, 'teamReport', { team: 'a', name: 'a3' }),
    await started(app, 'teamExport', { team: 'a', name: 'a4' }),
    await started(app, 'teamReport', { team: 'a', name: 'a5' }),
  ]
  for (const run of ofA)
    await untilWithin(() => app.runs.read(run)?.steps[0]?.state === 'started', `the run ${run} works`)
  const sixth = await started(app, 'teamExport', { team: 'a', name: 'a6' })
  const ofB = await started(app, 'teamExport', { team: 'b', name: 'b1' })
  await untilWithin(() => app.runs.read(ofB)?.steps[0]?.state === 'started', 'the run of the other team works')
  await settle()
  assert.equal(app.runs.read(sixth)?.state, 'queued', 'a sixth run of either flow waits its turn for the team')
  assert.deepEqual(
    ofA.map((run) => app.runs.read(run)?.state),
    ['running', 'running', 'running', 'running', 'running'],
  )
  // One run of the team ends, of the other flow: the run that waited takes its place.
  await app.call('addMark', { what: 'go a1' }, { as: system })
  assert.equal(await app.runs.wait(ofA[0]), 'a1')
  await untilWithin(() => app.runs.read(sixth)?.steps[0]?.state === 'started', 'the sixth run works')
  for (const name of ['a2', 'a3', 'a4', 'a5', 'a6', 'b1'])
    await app.call('addMark', { what: `go ${name}` }, { as: system })
  assert.equal(await app.runs.wait(sixth), 'a6')
})

/** `_t_runs` as a data file of the first build of flows holds it: with no `key`, no `from` and one index. */
function runsBefore(): TableLayout {
  const text: ColumnType = { kind: 'text' }
  const maybe: ColumnType = { kind: 'text', optional: true }
  const data: ColumnType = { kind: 'json', optional: true }
  const moment: ColumnType = { kind: 'date', optional: true }
  const columns: Record<string, ColumnType> = {}
  for (const name of ['id', 'flow', 'kind', 'version', 'state', 'as', 'top']) columns[name] = text
  for (const name of ['parent', 'leave', 'thread']) columns[name] = maybe
  for (const name of ['input', 'event', 'startedBy', 'parentStep', 'given', 'answer', 'error', 'used'])
    columns[name] = data
  for (const name of ['wakeAt', 'createdAt', 'endedAt']) columns[name] = moment
  columns.workedMs = { kind: 'number', whole: true, optional: true }
  return { name: '_t_runs', columns, key: ['id'], indexes: [['state', 'wakeAt']], unique: [], search: [] }
}

test('[46-1] a data file whose `_t_runs` has the layout of before gains `key` and `from` with the index over `flow` and `key`, and keeps its runs', async (t) => {
  const work = workFolder(t)
  const dataFolder = join(work, 'data')
  const store = sqliteStore()
  store.open(dataFolder)
  const endedAt = new Date()
  store.write(
    (tx) => {
      applySteps(tx, store, [{ do: 'addTable', table: '_t_runs', layout: runsBefore() }])
      tx.add(
        '_t_runs',
        {
          id: 'run-of-before',
          flow: 'ship',
          kind: 'flow',
          version: 'before',
          state: 'done',
          as: 'system',
          top: 'run-of-before',
          startedBy: { kind: 'system' },
          answer: 'shipped long ago',
          used: [],
          workedMs: 3,
          createdAt: endedAt,
          endedAt,
        },
        system,
      )
    },
    { steps: true },
  )
  store.close()

  const bundle = await bundled(t, { project }, work)
  const app = await engineOf(t).open(bundle.folder, { dataFolder, mode: 'test' })
  const kept = app.runs.read('run-of-before')
  assert.equal(kept?.state, 'done', 'the run of before is kept')
  assert.equal(kept?.answer, 'shipped long ago')
  const run = await started(app, 'ship', { order: 'o9' })
  assert.equal(app.runs.read(run)?.key, 'o9', 'a new run keeps its key in the new column')
  assert.equal(app.runs.find({ flow: 'ship', key: 'o9' }).length, 1)
  await app.close()

  const reopened = sqliteStore()
  reopened.open(dataFolder)
  try {
    const layout = reopened.layout().find((one) => one.name === '_t_runs')
    assert.ok(layout?.columns.key, 'the column `key`')
    assert.ok(layout?.columns.from, 'the column `from`')
    assert.deepEqual(layout?.indexes, [
      ['state', 'wakeAt'],
      ['flow', 'key'],
    ])
  } finally {
    reopened.close()
  }
})
