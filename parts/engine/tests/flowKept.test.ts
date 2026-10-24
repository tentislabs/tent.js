import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { Running } from './apps.ts'
import { addUser, bundled, engineOf, send, system, workFolder } from './apps.ts'
import { flowing, marksOf, settle, started, untilWithin, untilState } from './flowing.ts'

/** Sends a command to the admin channel of an app, as a command of this computer does, and answers its value. */
async function did(run: Running, name: string, args: object): Promise<Record<string, unknown>> {
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(run.app, `${run.origin}/_t/admin/${name}`, {
    body: JSON.stringify({ args }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  return Object(answered.body.value)
}

test("[20-7@7b] a person's export holds the runs they started, with the steps of a run that ran as them, and their removal removes those runs", async (t) => {
  const run = await flowing(t)
  const { app } = run
  const ada = await addUser(app, 'Ada')
  const bob = await addUser(app, 'Bob')
  const adaId = String(ada.user?.id)
  const asAda = await started(app, 'asStarter', undefined, ada)
  const full = await started(app, 'twoChanges', undefined, ada)
  const ofBob = await started(app, 'asStarter', undefined, bob)
  await app.runs.wait(asAda)
  await app.runs.wait(ofBob)
  await untilState(app, full, 'waiting')

  const exported = await did(run, 'data', { what: 'user', do: 'export', id: adaId })
  const runs: Record<string, unknown>[] = Object(exported.runs)
  assert.deepEqual(
    runs.map((one) => one.id).sort(),
    [asAda, full].sort(),
    'the runs that Ada started, and no run of Bob',
  )
  const [theirs, system] = [runs.find((one) => one.id === asAda), runs.find((one) => one.id === full)]
  assert.deepEqual(
    Object(theirs?.steps).map((step: Record<string, unknown>) => step.name),
    ['my notes', 'staff only'],
    'a run that ran as them is theirs with its saved steps',
  )
  assert.deepEqual(system?.steps, [], 'a run that had full access is listed without its steps')

  const shown = await did(run, 'data', { what: 'user', do: 'remove', id: adaId })
  assert.deepEqual([shown.removed, shown.runs], [false, 2], 'the removal shows the count first')
  assert.ok(app.runs.read(asAda))
  const removed = await did(run, 'data', { what: 'user', do: 'remove', id: adaId, yes: true })
  assert.deepEqual([removed.removed, removed.runs], [true, 2])
  assert.equal(app.runs.read(asAda), undefined)
  assert.equal(app.runs.read(full), undefined)
  assert.equal(app.runs.read(ofBob)?.state, 'done', 'the run of another person stays')
  // What the engine kept by run goes with the runs: the once-only keys of the changes that their steps called.
  const data = new DatabaseSync(join(run.dataFolder, 'data.db'), { readOnly: true })
  try {
    const kept = data.prepare('SELECT run FROM "_t_once"').all()
    assert.ok(kept.every((row) => row.run !== full && row.run !== asAda))
    assert.equal(data.prepare('SELECT count(*) AS n FROM "_t_steps" WHERE run IN (?, ?)').get(asAda, full)?.n, 0)
  } finally {
    data.close()
  }
})

test('[21-17@7b] a hard switch is refused while a run of an older version waits, and with `hard: stop` it stops that run', async (t) => {
  const run = await flowing(t)
  const { app } = run
  const unique = await bundled(t, {
    project: 'flowing',
    change: (description) => Object.assign(Object(Object(description.tables.marks.columns).what), { unique: true }),
  })
  const soft = await bundled(t, {
    project: 'flowing',
    change: (description) => void Object.assign(description.flows.greet, { about: 'a new sentence' }),
  })
  const waiting = await started(app, 'waitsForPerson')
  await untilState(app, waiting, 'waiting')
  const first = app.versions()[0].id
  assert.equal(app.versions()[0].needed, true, 'a version of which a run has not ended is needed')

  // A switch that is not hard is taken: the run keeps the version it started with, which stays loadable.
  const two = await app.add(soft.folder)
  assert.equal((await app.switch(two)).hard, false)
  assert.equal(app.runs.read(waiting)?.version, first)
  assert.equal(await app.drop(first), false, 'a version that a run needs is not dropped')
  assert.deepEqual(Object(await app.facts()).waitingStepNames, { waitsForPerson: ['approval', 'before'] })

  // A hard switch is refused while the run of the older version waits, and nothing is changed.
  const three = await app.add(unique.folder)
  const refused = await app.switch(three)
  assert.deepEqual([refused.hard, refused.refused, refused.runs], [true, 'runs', [waiting]])
  assert.equal(app.versions().find((one) => one.running)?.id, two)
  assert.equal(app.runs.read(waiting)?.state, 'waiting')
  // With `hard: 'stop'` the run is stopped, and the switch is taken.
  const stopped = await app.switch(three, { hard: 'stop' })
  assert.deepEqual([stopped.hard, stopped.refused, stopped.stopped], [true, undefined, [waiting]])
  assert.equal(app.runs.read(waiting)?.state, 'stopped')
  assert.deepEqual(
    app.versions().map((one) => [one.id, one.running]),
    [[three, true]],
  )
  // The runner reads from the version that runs now: a run that is started takes it.
  const later = await started(app, 'greet', { name: 'Ada' })
  assert.equal(await app.runs.wait(later), 'hello Ada')
  assert.equal(app.runs.read(later)?.version, three)
})

test('[21-17@7b] in the mode development a run that waits is carried on by its version after the engine was opened anew', async (t) => {
  const work = workFolder(t)
  const one = await bundled(t, { project: 'flowing' }, work)
  const two = await bundled(
    t,
    { project: 'flowing', change: (description) => void Object.assign(description.flows.greet, { about: 'another' }) },
    work,
  )
  const dataFolder = join(work, 'data')
  const first = engineOf(t)
  const app = await first.open(one.folder, { dataFolder, mode: 'development' })
  const waiting = await started(app, 'waitsForPerson')
  await untilState(app, waiting, 'waiting')
  await app.switch(await app.add(two.folder))
  await first.close()

  // The engine is opened anew on the second version: the first is made loadable again for the run that needs it.
  const second = engineOf(t)
  const again = await second.open(two.folder, { dataFolder, mode: 'development' })
  await settle()
  assert.equal(again.runs.read(waiting)?.version, one.versionId)
  assert.deepEqual(
    again.versions().map((version) => [version.id, version.running, version.needed]),
    [
      [two.versionId, true, false],
      [one.versionId, false, true],
    ],
  )
  again.runs.approve(waiting, 'approval', { by: 'a test' })
  assert.deepEqual(await again.runs.wait(waiting), {
    approved: true,
    data: { by: 'a test' },
    shown: { ask: 'May it go on?' },
  })
})

test('[21-20@7b] `step.done` is raised for each step that was done, with its app, its flow, its run and its name', async (t) => {
  const { app, engine } = await flowing(t)
  const heard: unknown[] = []
  engine.on('step.done', (told) => void heard.push([told.app === app, told.flow, told.run, told.step]))
  const run = await started(app, 'waitsForPerson')
  await untilState(app, run, 'waiting')
  assert.deepEqual(heard, [[true, 'waitsForPerson', run, 'before']], 'a step that waits is not done')
  app.runs.refuse(run, 'approval')
  await app.runs.wait(run)
  assert.deepEqual(heard, [
    [true, 'waitsForPerson', run, 'before'],
    [true, 'waitsForPerson', run, 'approval'],
  ])
})

test('[16-4@7b] `_t_once` exists in the data of an app with exactly its columns and its key, and holds one row for each change that a step called', async (t) => {
  const { app, dataFolder, advance } = await flowing(t)
  const run = await started(app, 'twoChanges')
  await untilState(app, run, 'waiting')
  advance(5000)
  await app.runs.wait(run)
  await untilWithin(
    async () => (await marksOf(app)).includes('greeted from a step'),
    'the run that the step started has ended',
  )
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    const columns = data.prepare(`SELECT name, pk FROM pragma_table_info('_t_once')`).all()
    assert.deepEqual(
      columns.map((column) => column.name),
      ['caller', 'key', 'run', 'at', 'result', 'places'],
    )
    assert.deepEqual(
      columns.filter((column) => column.pk).map((column) => column.name),
      ['caller', 'key'],
    )
    const rows = data.prepare('SELECT key, run, result FROM "_t_once" ORDER BY at').all()
    // The step called four changes over its two tries, and the run it started called one.
    assert.equal(rows.length, 5)
    assert.equal(rows.filter((row) => row.run === run).length, 4)
    assert.ok(
      rows.every((row) => /^[0-9a-f]{32}$/.test(String(row.key))),
      'a key is 32 characters of a fingerprint',
    )
    assert.equal(new Set(rows.map((row) => row.key)).size, 5)
    assert.equal(
      Object(JSON.parse(String(rows[0].result))).what.startsWith('both: '),
      true,
      'the answer of the change is kept',
    )
    // The run tables stand beside it, since the app holds a flow.
    const tables = data
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '\\_t\\_%' ESCAPE '\\'`)
      .all()
    for (const name of ['_t_runs', '_t_steps', '_t_schedule', '_t_once'])
      assert.ok(
        tables.some((table) => table.name === name),
        name,
      )
  } finally {
    data.close()
  }
  assert.equal(await app.call('allMarks', {}, { as: system }).then((rows) => Object(rows).length), 5)
})
