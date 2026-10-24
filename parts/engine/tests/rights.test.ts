import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addUser, codeOf, logColumns, logRows, nobody, running, system } from './apps.ts'

test('[11-2] a function that is called from code runs as the same caller and passes its own rule, and call calls as the system', async (t) => {
  const { app, dataFolder } = await running(t)
  const ada = await addUser(app, 'Ada', ['staff'])
  const bob = await addUser(app, 'Bob')
  await app.call('addTag', { name: 'one' }, { as: ada })

  // `app.call` of a program runs as the caller that `as` names.
  assert.equal(await app.call('whoAmI', {}, { as: ada }), ada.user?.id)
  assert.equal(await app.call('whoAmI', {}, { as: bob }), bob.user?.id)
  assert.equal(await app.call('whoAmI', {}, { as: nobody }), 'no user')
  assert.equal(await app.call('whoAmI', {}, { as: system }), 'no user')
  // A call that names no caller runs as nobody.
  assert.equal(await codeOf(Reflect.apply(app.call, app, ['countNotes', {}])), 'T0006')

  // Code: a function that another function calls runs as the caller of the first.
  assert.equal(await app.call('outerWho', {}, { as: ada }), ada.user?.id)
  assert.equal(await app.call('outerWho', {}, { as: bob }), bob.user?.id)
  // Its own rule holds however it is reached: the outer function is open to anyone, the inner one to nobody.
  assert.equal(await codeOf(app.call('callsClosed', {}, { as: nobody })), 'T0006')
  assert.equal(await codeOf(app.call('callsClosed', {}, { as: ada })), 'T3101')
  // A caller that is the system passes every rule, in the function it calls too.
  assert.equal(await app.call('callsClosed', {}, { as: system }), 1)
  // Its input types hold too.
  assert.equal(await codeOf(app.call('deep', { n: 'three' }, { as: ada })), 'T0002')

  // `call`, which a function that states `system` is handed, calls as the system: the rule lets it in, and the
  // function it reaches runs with no user.
  assert.equal(await app.call('asSystem', {}, { as: nobody }), 1)
  assert.equal(await app.call('asSystem', {}, { as: bob }), 1)
  assert.equal(await app.call('systemSays', {}, { as: ada }), 'no user')
  // The log names the system for the inner call, and the caller for the outer one.
  const rows = logRows(dataFolder, 'calls')
  const last = (name: string) => rows.findLast((row) => row.name === name)
  assert.deepEqual([last('systemSays')?.callerKind, last('systemSays')?.callerId], ['user', ada.user?.id])
  assert.deepEqual([last('whoAmI')?.callerKind, last('whoAmI')?.callerId], ['system', null])

  // Full access needs `system`: with it a function reads the rows of everyone, and without it those of its caller.
  await app.call('addNote', { title: 'of Ada' }, { as: ada })
  await app.call('addNote', { title: 'of Bob' }, { as: bob })
  await app.call('addNote', { title: 'of Bob too' }, { as: bob })
  assert.equal(await app.call('countNotes', {}, { as: ada }), 1)
  assert.equal(await app.call('countNotes', {}, { as: bob }), 2)
  assert.equal(await app.call('countNotes', {}, { as: system }), 3)
  assert.equal(await app.call('everyNote', {}, { as: ada }), 3)
  assert.equal(await app.call('rawNotes', {}, { as: bob }), 3)
  assert.equal(await codeOf(app.call('noSystem', {}, { as: ada })), 'T0013')
  assert.equal(await codeOf(app.call('rawNoSystem', {}, { as: bob })), 'T0013')
  // The table rules hold for a write as the caller: the owner of a new row is its caller.
  const mine = await app.call('notesBy', { done: false }, { as: bob })
  assert.ok(Array.isArray(mine) && mine.length === 2 && mine.every((row) => row.owner === bob.user?.id))
})

test('[16-4@4] the tables of the log hold exactly their columns, and the handles log and settings work in a call', async (t) => {
  const { app, dataFolder } = await running(t)
  const ada = await addUser(app, 'Ada')

  const tables: Record<string, string[]> = {
    calls: [
      'at',
      'app',
      'name',
      'kind',
      'callerKind',
      'callerId',
      'ms',
      'ok',
      'code',
      'ref',
      'trace',
      'span',
      'parent',
    ],
    errors: ['ref', 'at', 'name', 'message', 'stack', 'trace', 'span'],
    slow: ['at', 'name', 'ms', 'rows', 'trace', 'span', 'parent'],
    denied: ['at', 'name', 'callerKind', 'callerId', 'rule', 'trace', 'span'],
    lines: ['at', 'level', 'message', 'data', 'name', 'run', 'trace', 'span'],
  }
  for (const [table, columns] of Object.entries(tables)) assert.deepEqual(logColumns(dataFolder, table), columns, table)

  // Step 10: each call is a row, with its name, its kind, its caller, the time it took and whether it worked.
  const before = Date.now()
  await app.call('addNote', { title: 'logged' }, { as: ada })
  await app.call('countNotes', {}, { as: ada })
  await app.call('remind', {}, { as: ada })
  await assert.rejects(app.call('staffTags', {}, { as: ada }))
  await assert.rejects(app.call('addNote', { title: 'too', secret: 'a word that must not be kept' }, { as: ada }))
  const calls = logRows(dataFolder, 'calls').slice(1)
  assert.deepEqual(
    calls.map((row) => [row.app, row.name, row.kind, row.callerKind, row.callerId, row.ok, row.code]),
    [
      ['desk', 'addNote', 'change', 'user', ada.user?.id, 1, null],
      ['desk', 'countNotes', 'query', 'user', ada.user?.id, 1, null],
      ['desk', 'remind', 'action', 'user', ada.user?.id, 1, null],
      ['desk', 'staffTags', 'query', 'user', ada.user?.id, 0, 'T3101'],
      ['desk', 'addNote', 'change', 'user', ada.user?.id, 0, 'T0002'],
    ],
  )
  for (const row of calls) {
    assert.ok(Number(row.at) >= before && Number(row.at) <= Date.now())
    assert.ok(Number.isInteger(row.ms) && Number(row.ms) >= 0)
  }
  // No input is written into the log.
  for (const table of Object.keys(tables))
    assert.equal(JSON.stringify(logRows(dataFolder, table)).includes('must not be kept'), false, table)

  // The handle `log` writes a line with the definition whose code wrote it.
  await app.call('noted', { title: 'a title' }, { as: ada })
  assert.deepEqual(
    logRows(dataFolder, 'lines').map((row) => [row.level, row.message, row.data, row.name, row.run]),
    [
      ['info', 'a note was seen', '{"title":"a title"}', 'noted', null],
      ['warn', 'it was seen twice', null, 'noted', null],
      ['error', 'it was seen three times', null, 'noted', null],
    ],
  )
  // A setting answers its default.
  assert.equal(await app.call('shop', {}, { as: nobody }), 'The desk')
})

test('[11-2] a run that was read is carried out by the engine as the same caller, and what it calls passes the door', async (t) => {
  const body = [
    { const: 'held', value: { plan: { db: 'notes' }, then: [{ count: [] }] } },
    {
      return: {
        op: '+',
        left: { op: '+', left: { name: ['held'] }, right: { name: ['input', 'n'] } },
        right: { call: { function: 'countNotes' }, args: [] },
      },
    },
  ]
  const { app, bundle, dataFolder } = await running(t, { bodies: { bodied: { run: body } } })
  // The definition is plain: the description holds its body and no module.
  assert.equal(bundle.description.functions.bodied.form, 'plain')
  assert.equal(bundle.description.functions.bodied.module, undefined)
  const ada = await addUser(app, 'Ada')
  const bob = await addUser(app, 'Bob')
  await app.call('addNote', { title: 'of Ada' }, { as: ada })
  await app.call('addNote', { title: 'of Bob' }, { as: bob })
  await app.call('addNote', { title: 'of Bob too' }, { as: bob })
  assert.equal(await app.call('bodied', { n: 10 }, { as: ada }), 12)
  assert.equal(await app.call('bodied', { n: 10 }, { as: bob }), 14)
  assert.equal(await codeOf(app.call('bodied', { n: 10 }, { as: nobody })), 'T0006')
  assert.equal(await codeOf(app.call('bodied', { n: 'ten' }, { as: ada })), 'T0002')
  // The call inside the body is a call like any other: it has its own row in the log, as the same caller.
  const rows = logRows(dataFolder, 'calls').slice(-4)
  assert.deepEqual(
    rows.map((row) => [row.name, row.callerId, row.ok, row.code]),
    [
      ['countNotes', bob.user?.id, 1, null],
      ['bodied', bob.user?.id, 1, null],
      ['bodied', null, 0, 'T0006'],
      ['bodied', ada.user?.id, 0, 'T0002'],
    ],
  )
})
