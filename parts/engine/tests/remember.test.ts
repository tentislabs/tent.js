import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { addUser, running, send, system } from './apps.ts'
import { notDropped } from './started.ts'

/** The app of the project of remembered answers, with two callers who are signed in. */
async function remembering(t: TestContext) {
  const run = await running(t, { project: 'remembering' })
  const ada = await addUser(run.app, 'Ada')
  const bo = await addUser(run.app, 'Bo')
  return { ...run, ada, bo }
}

test('[51-6] a second call of a definition that states remember, with the same input and by the same caller, is not carried out, and one by another caller is', async (t) => {
  const { app, ada, bo } = await remembering(t)
  const first = await app.call('counted', { n: 1 }, { as: ada })
  assert.equal(await app.call('counted', { n: 1 }, { as: ada }), first, 'the same call was carried out again')
  assert.notEqual(await app.call('counted', { n: 2 }, { as: ada }), first, 'another input was given the answer')
  assert.notEqual(await app.call('counted', { n: 1 }, { as: bo }), first, 'another caller was given the answer')
})

test('[51-6] with shared, a second caller is given the remembered answer where what the work read answers the same for them, and is not where it answers them otherwise', async (t) => {
  const { app, ada, bo } = await remembering(t)
  await app.call('addMark', { what: 'one' }, { as: ada })
  const marks = await app.call('markCount', { n: 1 }, { as: ada })
  assert.equal(await app.call('markCount', { n: 1 }, { as: bo }), marks)
  await app.call('addNote', { title: 'Ada own' }, { as: ada })
  const notes = await app.call('noteCount', { n: 1 }, { as: ada })
  assert.notEqual(
    await app.call('noteCount', { n: 1 }, { as: bo }),
    notes,
    'a caller who reads other rows was given the answer',
  )
})

test('[51-6] a remembered answer goes with the rows that fed it: a change of those rows makes the work be carried out anew', async (t) => {
  const { app, ada } = await remembering(t)
  const mark = Object(await app.call('addMark', { what: 'one' }, { as: ada }))
  const first = await app.call('markCount', { n: 2 }, { as: ada })
  assert.equal(await app.call('markCount', { n: 2 }, { as: ada }), first)
  await app.call('removeMark', { id: String(mark.id) }, { as: ada })
  assert.notEqual(
    await app.call('markCount', { n: 2 }, { as: ada }),
    first,
    'an answer was given after its rows changed',
  )
})

test('[51-6] two same calls at one moment are carried out once, and a step with key is not carried out a second time for the same values', async (t) => {
  const { app, ada } = await remembering(t)
  const [one, two] = await Promise.all([
    app.call('counted', { n: 9 }, { as: ada }),
    app.call('counted', { n: 9 }, { as: ada }),
  ])
  assert.equal(one, two)
  const first = await app.runs.wait(notDropped(await app.start('keyed', { n: 5 }, { as: system })).run)
  const second = await app.runs.wait(notDropped(await app.start('keyed', { n: 5 }, { as: system })).run)
  assert.equal(second, first)
  const other = await app.runs.wait(notDropped(await app.start('keyed', { n: 6 }, { as: system })).run)
  assert.notEqual(other, first)
})

test('[51-11.7] a caller who hands a remembering definition the id of a row it may not read is not given what was remembered for one who may, and a second caller of a definition that reads user is given its own', async (t) => {
  const { app, ada, bo } = await remembering(t)
  const note = String(Object(await app.call('addNote', { title: 'secret' }, { as: ada })).id)
  const mine = String(await app.call('noteTitle', { id: note }, { as: ada }))
  assert.match(mine, /^secret /)
  const theirs = String(await app.call('noteTitle', { id: note }, { as: bo }))
  assert.match(theirs, /^none /, 'the answer made from a row Bo may not read was given to Bo')
  const adaName = String(await app.call('nameOf', { n: 1 }, { as: ada }))
  const boName = String(await app.call('nameOf', { n: 1 }, { as: bo }))
  assert.ok(adaName.startsWith(`${String(ada.user?.id)} `), adaName)
  assert.ok(boName.startsWith(`${String(bo.user?.id)} `), boName)
})

test("[51-6] a person's removal removes the answers that were remembered for them", async (t) => {
  const { app, ada, bo, dataFolder, origin } = await remembering(t)
  await app.call('counted', { n: 1 }, { as: ada })
  await app.call('counted', { n: 1 }, { as: bo })
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(app, `${origin}/_t/admin/data`, {
    body: JSON.stringify({ args: { what: 'user', do: 'remove', id: ada.user?.id, yes: true } }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  const callers = data
    .prepare('SELECT caller FROM _t_remembered')
    .all()
    .map((row) => String(row.caller))
  data.close()
  assert.deepEqual(callers, [`user:${bo.user?.id}`], 'only the answer of the other caller stays')
})
