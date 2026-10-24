import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Description, Facts } from '../../core/internal.ts'
import { sqliteStore } from '../../data/index.ts'
import { readFacts } from '../index.ts'
import { addUser, engineOf, running, send, system, workFolder } from './apps.ts'

/** A description as a later state of the files would give it: the one of the running app, changed by a hand. */
function later(description: Description, change: (changed: Description) => void): Description {
  const changed: Description = JSON.parse(JSON.stringify(description))
  change(changed)
  return changed
}

/** The columns of a table of a description, by their names, for a hand to change. */
const columns = (description: Description, table: string): Record<string, Record<string, unknown>> =>
  Object(description.tables[table].columns)

/** Each finding of the facts as its code and its words. */
const told = (facts: Facts): [string, string][] => facts.tableFindings.map((one) => [one.code, one.message])

const none: Facts = { tableFindings: [], waitingStepNames: {} }

// Four states of the files that the data of the desk does not bear, each with what the data says of it.
const changes: [what: string, change: (changed: Description) => void, found: [string, string][]][] = [
  [
    'a column that is gone',
    (changed) => {
      delete columns(changed, 'notes').secret
    },
    [['T2002', 'The column `notes.secret` is gone, and `removed` does not name it.']],
  ],
  [
    'a table that is gone',
    (changed) => {
      delete changed.tables.uses
    },
    [['T2003', 'The table `uses` is gone, and `removed` of the project does not name it.']],
  ],
  [
    'a column under a new name',
    (changed) => {
      columns(changed, 'tags').label = { ...columns(changed, 'tags').name, optional: true }
      delete columns(changed, 'tags').name
    },
    [['T2004', 'The column `tags.name` is gone and `label` is new, with no `was`.']],
  ],
  [
    'a column that becomes required, with a row that holds nothing in it',
    (changed) => {
      delete columns(changed, 'users').salary.optional
    },
    [['T2001', '1 row of `users` does not fit what `users.salary` becomes.']],
  ],
]

test('[15-7] app.facts answers what the data of a running app says of a table change, and readFacts the same with no engine running', async (t) => {
  const run = await running(t)
  // For the description of the running version the data says nothing: the app opened on it.
  assert.deepEqual(run.app.facts(), none)
  assert.deepEqual(run.app.facts(run.app.description), none)
  await addUser(run.app, 'Ada')
  await addUser(run.app, 'Bob', [], 30)
  const before = await run.app.read({ from: 'users' }, { as: 'system' })

  for (const [what, change, found] of changes) {
    const facts = await run.app.facts(later(run.app.description, change))
    assert.deepEqual(told(facts), found, what)
    for (const one of facts.tableFindings) {
      assert.ok(one.fix, what)
      assert.deepEqual([one.level, one.docs], ['error', `tent docs ${one.code}`])
    }
    assert.deepEqual(facts.waitingStepNames, {})
  }
  // Every finding of a change is answered at once, and a change that the data bears is none.
  const several = later(run.app.description, (changed) => {
    for (const [, change] of changes) change(changed)
    columns(changed, 'tags').note = { kind: 'text', optional: true }
  })
  assert.deepEqual(
    told(await run.app.facts(several))
      .map(([code]) => code)
      .sort(),
    ['T2001', 'T2002', 'T2003', 'T2004'],
  )
  const added = later(run.app.description, (changed) => {
    columns(changed, 'tags').note = { kind: 'text', optional: true }
  })
  assert.deepEqual(run.app.facts(added), none)
  // Asking changed nothing: the app holds its rows and its tables, and goes on.
  assert.deepEqual(await run.app.read({ from: 'users' }, { as: 'system' }), before)
  assert.equal(Object(await run.app.call('addTag', { name: 'new' }, { as: system })).name, 'new')

  // What is no description is refused, and reads nothing.
  assert.throws(() => run.app.facts(Object('a description')), { code: 'T0013' })

  await run.engine.close()
  assert.throws(() => run.app.facts(), { code: 'T0013' })

  // With no engine running, the data folder is opened to read alone for the length of the call.
  const files = readdirSync(run.dataFolder).sort()
  assert.deepEqual(readFacts(run.dataFolder, run.bundle.description), none)
  for (const [what, change, found] of changes)
    assert.deepEqual(told(await readFacts(run.dataFolder, later(run.bundle.description, change))), found, what)
  assert.equal(existsSync(join(run.dataFolder, 'engine.json')), false)
  assert.deepEqual(
    readdirSync(run.dataFolder)
      .filter((name) => !/-(wal|shm)$/.test(name))
      .sort(),
    files.filter((name) => !/-(wal|shm)$/.test(name)),
  )

  // A folder that holds no data says nothing, and nothing is made in it.
  const empty = join(workFolder(t), 'none')
  assert.deepEqual(readFacts(empty, run.bundle.description), none)
  assert.equal(existsSync(empty), false)

  // With a `store` among the makers, the data is read through the store that it makes, which is closed again.
  const made: string[] = []
  const closed: string[] = []
  const facts = await readFacts(run.dataFolder, later(run.bundle.description, changes[0][1]), {
    makers: {
      store: (o) => {
        made.push(o.dataFolder)
        const store = sqliteStore()
        return Object.assign(Object.create(store), {
          close: () => {
            closed.push(o.dataFolder)
            store.close()
          },
        })
      },
    },
  })
  assert.deepEqual(told(facts), changes[0][2])
  assert.deepEqual([made, closed], [[run.dataFolder], [run.dataFolder]])

  // The app opens again on its data, which the reading left as it was.
  const again = await engineOf(t).open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
  assert.deepEqual(again.facts(), none)
  assert.equal(Object(await again.read({ from: 'users' }, { as: 'system' })).length, 2)
})

test('[15-6@4] the command `facts` of the admin channel answers the Facts of the check, for the description it is handed', async (t) => {
  const run = await running(t)
  await addUser(run.app, 'Ada')
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  const command = (args: object) =>
    send(run.app, `${run.origin}/_t/admin/facts`, {
      body: JSON.stringify({ args }),
      headers: { authorization: `Bearer ${token}` },
    })
  const plain = await command({})
  assert.deepEqual([plain.status, plain.body], [200, { ok: true, value: none }])
  for (const [what, change, found] of changes) {
    const answered = await command({ description: later(run.app.description, change) })
    assert.equal(answered.status, 200, what)
    const value: Facts = Object(answered.body.value)
    assert.deepEqual(told(value), found, what)
    assert.deepEqual(value.waitingStepNames, {})
  }
  // What is no description is a word of another kind than the command takes.
  const wrong = await command({ description: 'the shop' })
  assert.deepEqual([wrong.status, wrong.error.code], [400, 'T0002'])
  // Without the token the command answers nobody.
  const closed = await send(run.app, `${run.origin}/_t/admin/facts`, { body: JSON.stringify({ args: {} }) })
  assert.deepEqual([closed.status, closed.error.code], [401, 'T0006'])
})
