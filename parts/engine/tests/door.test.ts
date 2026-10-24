import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
import { addUser, codeOf, logRows, nobody, refusal, running, system } from './apps.ts'

const titles = (rows: unknown): string[] => (Array.isArray(rows) ? rows.map((row) => String(Object(row).title)) : [])

test('[16-2@4] T0001, T0006, T3101 and T0002: a name that is not there, a rule that does not let the caller in, and an input that does not fit', async (t) => {
  const { app, dataFolder } = await running(t)
  const ada = await addUser(app, 'Ada', ['staff'])
  const bob = await addUser(app, 'Bob')

  // Step 5: nothing but a function of the description is reached by a name.
  for (const name of ['nothing', 'notes', 'desk', 'constructor', '__proto__', 'toString', 'addNote.run', ''])
    assert.equal(await codeOf(app.call(name, {}, { as: system })), 'T0001', name)

  // Step 6: a caller who is nobody is told to sign in, and a signed-in caller whom the rule keeps out is denied.
  assert.equal(await codeOf(app.call('countNotes', {}, { as: nobody })), 'T0006')
  assert.equal(await codeOf(app.call('staffTags', {}, { as: nobody })), 'T0006')
  assert.equal(await codeOf(app.call('staffTags', {}, { as: bob })), 'T3101')
  assert.deepEqual(await app.call('staffTags', {}, { as: ada }), [])
  assert.equal(await codeOf(app.call('closed', {}, { as: nobody })), 'T0006')
  assert.equal(await codeOf(app.call('closed', {}, { as: ada })), 'T3101')
  assert.deepEqual(await app.call('publicTags', {}, { as: nobody }), [])
  // The system passes every rule.
  assert.equal(await app.call('closed', {}, { as: system }), 0)
  // A key is signed in, and has the roles it was made with.
  const key: Caller = { kind: 'key', key: { id: 'k1', scopes: [], roles: ['staff'] } }
  assert.deepEqual(await app.call('staffTags', {}, { as: key }), [])
  assert.equal(
    await codeOf(app.call('staffTags', {}, { as: { kind: 'key', key: { id: 'k2', scopes: [], roles: [] } } })),
    'T3101',
  )
  // A denied call is in the log, with its rule.
  const denied = logRows(dataFolder, 'denied')
  assert.deepEqual(
    denied.map((row) => [row.name, row.callerKind, row.rule]),
    [
      ['countNotes', 'nobody', 'signedIn'],
      ['staffTags', 'nobody', 'role'],
      ['staffTags', 'user', 'role'],
      ['closed', 'nobody', 'nobody'],
      ['closed', 'user', 'nobody'],
      ['staffTags', 'key', 'role'],
    ],
  )
  assert.equal(denied[2].callerId, bob.user?.id)

  // Step 7: the input is held to the declared types, each field named by the check it failed.
  const fields = async (input: unknown) => (await refusal(app.call('addNote', input, { as: ada }))).fields
  assert.deepEqual(await fields({}), { title: 'required' })
  assert.deepEqual(await fields({ title: 5 }), { title: 'type' })
  assert.deepEqual(await fields({ title: '' }), { title: 'min' })
  assert.deepEqual(await fields({ title: 'a', colour: 'red' }), { colour: 'unknown' })
  assert.equal(await codeOf(app.call('addNote', { title: 5 }, { as: ada })), 'T0002')
  assert.equal(await codeOf(app.call('addNote', 'a title', { as: ada })), 'T0002')
  assert.equal(await codeOf(app.call('addNote', [{ title: 'a' }], { as: ada })), 'T0002')
  // No input at all is an empty one, and `null` in a field means that it was not given.
  assert.deepEqual(await app.call('publicTags', undefined, { as: nobody }), [])
  assert.deepEqual(await fields({ title: null }), { title: 'required' })
  // The rule comes before the input: a caller who is kept out learns nothing of the types.
  assert.equal(await codeOf(app.call('addNote', { title: 5 }, { as: nobody })), 'T0006')
  // Nothing of a refused call was written.
  assert.equal(await app.call('countNotes', {}, { as: ada }), 0)

  // A rule made with `allow` runs on the checked input, with a `db` that reads as the caller.
  const note = Object(await app.call('addNote', { title: 'of Ada' }, { as: ada }))
  assert.equal(Object(await app.call('myNote', { note: note.id }, { as: ada })).title, 'of Ada')
  assert.equal(await codeOf(app.call('myNote', { note: note.id }, { as: bob })), 'T3101')
  assert.equal(await codeOf(app.call('myNote', { note: note.id }, { as: nobody })), 'T0006')
  assert.equal(await codeOf(app.call('myNote', { note: 7 }, { as: ada })), 'T0002')
})

test('[16-2@4] T0013, T0028 and T4101: what may not be used where, calls that nest too deep, and a query that is not pure', async (t) => {
  const { app } = await running(t)
  const ada = await addUser(app, 'Ada', ['staff'])

  // A change may not be called from a query, nor an action from a change: nothing of either was done.
  assert.equal(await codeOf(app.call('writesFromQuery', {}, { as: ada })), 'T0013')
  assert.deepEqual(await app.call('publicTags', {}, { as: nobody }), [])
  assert.equal(await codeOf(app.call('waitsInChange', {}, { as: ada })), 'T0013')
  // Full access is there only where the function states `system`.
  assert.equal(await codeOf(app.call('noSystem', {}, { as: ada })), 'T0013')
  assert.equal(await codeOf(app.call('rawNoSystem', {}, { as: ada })), 'T0013')
  assert.equal(await app.call('everyNote', {}, { as: ada }), 0)
  assert.equal(await app.call('rawNotes', {}, { as: ada }), 0)

  // Functions that call each other nest as deep as the project lets them, and one more is refused.
  assert.equal(await app.call('deep', { n: 5 }, { as: ada }), 5)
  const tooDeep = await refusal(app.call('deep', { n: 6 }, { as: ada }))
  assert.equal(tooDeep.code, 'T0028')
  assert.match(tooDeep.message, /\b6\b/)
  assert.equal(await codeOf(app.call('deep', { n: 400 }, { as: ada })), 'T0028')
  assert.equal(await app.call('deep', { n: 5 }, { as: ada }), 5)

  // While the `run` of a query runs, the clock, the random source and the network fail.
  for (const how of ['now', 'new', 'text'])
    assert.equal(await codeOf(app.call('byClock', { how }, { as: ada })), 'T4101', how)
  for (const how of ['word', 'bytes', 'id', 'math'])
    assert.equal(await codeOf(app.call('byDice', { how }, { as: ada })), 'T4101', how)
  assert.equal(await codeOf(app.call('byNet', {}, { as: ada })), 'T4101')
  // A moment that is made from a number is no clock, and the swap is taken back when the query has ended.
  assert.equal(await app.call('byClock', { how: 'from a number' }, { as: ada }), 5)
  assert.equal(typeof Date.now(), 'number')
  assert.equal(typeof Math.random(), 'number')
  assert.equal(typeof crypto.randomUUID(), 'string')
  assert.equal(new Date() instanceof Date, true)
  // It is taken back after a query that failed inside it too, and an action is held to none of it.
  assert.equal(await codeOf(app.call('breaks', {}, { as: ada })), 'T0009')
  assert.equal(typeof Date.now(), 'number')
  assert.equal(await app.call('remind', {}, { as: ada }), 0)
})

test('[16-2@4] T0009 and T0008: what does not fit the declared output, an error of the code of the app, and a body that works past its time', async (t) => {
  // A body that walks a million entries a million times ends on no computer: only its time ends it. The time of a
  // query is left as the framework gives it, so that no other query of this test is held to a short one.
  const walk = { for: 'i', of: { fn: 'range', args: [0, 1_000_000] }, do: [{ do: { name: ['i'] } }] }
  const spinning = [{ for: 'j', of: { fn: 'range', args: [0, 1_000_000] }, do: [walk] }, { return: 1 }]
  const { app, dataFolder } = await running(t, {
    bodies: { spins: { run: spinning } },
    change: (description) => Object.assign(description.project, { limits: { functionDepth: 6 } }),
  })
  const ada = await addUser(app, 'Ada', ['staff'], 5000)
  await addUser(app, 'Bob', [], 4000)
  await app.call('addNote', { title: 'first' }, { as: ada })
  await app.call('addNote', { title: 'second' }, { as: ada })

  // Step 9: the answer is filtered through the declared output, and a `private` column does not leave.
  assert.deepEqual(await app.call('people', {}, { as: ada }), [{ name: 'Ada' }, { name: 'Bob' }])
  const all = await app.call('salaries', {}, { as: ada })
  assert.ok(Array.isArray(all) && all.length === 2)
  for (const row of all) assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'id', 'name', 'roles', 'updatedAt'])
  // A query written with `run` and no `output` answers rows as `db` handed them, and nothing else.
  assert.deepEqual(titles(await app.call('handedNotes', {}, { as: ada })), ['first', 'second'])
  assert.equal(await codeOf(app.call('copiedNotes', {}, { as: ada })), 'T0009')
  // An answer that does not fit the output is the fault of the app, and is logged with what did not fit.
  assert.equal(await codeOf(app.call('badOutput', {}, { as: ada })), 'T0009')
  // A change written with `set` answers its row, without what is private.
  const added = Object(await app.call('addUser', { name: 'Cy', roles: [], salary: 1 }, { as: system }))
  assert.deepEqual(Object.keys(added).sort(), ['createdAt', 'id', 'name', 'roles', 'updatedAt'])
  // A list of writes answers a list in the same order, each row without what is private.
  const pair = await app.call('addPair', { person: 'Di', tag: 'new' }, { as: system })
  assert.ok(Array.isArray(pair) && pair.length === 2)
  assert.deepEqual(Object.keys(pair[0]).sort(), ['createdAt', 'id', 'name', 'roles', 'updatedAt'])
  assert.deepEqual([pair[0].name, pair[1].name], ['Di', 'new'])
  // A change written with `run` that states no output answers nothing.
  assert.equal(await app.call('noted', { title: 'x' }, { as: ada }), undefined)

  // An error of the code of the app is logged with its trace, and the engine keeps running.
  const broke = await refusal(app.call('breaks', {}, { as: ada }))
  assert.equal(broke.code, 'T0009')
  assert.ok(broke.cause instanceof RangeError)
  // An own `fail` arrives as itself, and undoes its change.
  const failed = await refusal(app.call('fails', { title: 'never kept' }, { as: ada }))
  assert.equal(failed.code, 'not-today')
  assert.equal(failed.message, 'No note is taken today.')
  assert.deepEqual(failed.fields, { title: 'taken' })
  assert.equal(await app.call('countNotes', {}, { as: ada }), 2)

  // A body that was read is stopped at its next entry once the time of its call is up, and the engine answers on.
  const began = performance.now()
  assert.equal(await codeOf(app.call('spins', {}, { as: ada })), 'T0008')
  assert.ok(performance.now() - began >= 900, 'the body worked for the time of a query')
  assert.equal(await app.call('countNotes', {}, { as: ada }), 2)

  // The log holds each failure with its code, and for what a caller is not shown a ref that finds the error.
  const calls = logRows(dataFolder, 'calls')
  const of = (name: string) => calls.filter((row) => row.name === name)
  assert.deepEqual([of('badOutput')[0].ok, of('badOutput')[0].code], [0, 'T0009'])
  assert.deepEqual([of('fails')[0].ok, of('fails')[0].code, of('fails')[0].ref], [0, 'not-today', null])
  assert.deepEqual([of('spins')[0].ok, of('spins')[0].code], [0, 'T0008'])
  const errors = logRows(dataFolder, 'errors')
  const ref = String(of('breaks')[0].ref)
  assert.match(ref, /^[0-9a-z]{8}$/)
  const kept = errors.find((row) => row.ref === ref)
  assert.equal(kept?.name, 'breaks')
  assert.match(String(kept?.message), /the code of the app broke/)
  assert.match(String(kept?.stack), /RangeError/)
  const misfit = errors.find((row) => row.ref === of('badOutput')[0].ref)
  assert.match(String(misfit?.message), /output/)
  assert.match(String(errors.find((row) => row.ref === of('copiedNotes')[0].ref)?.message), /output/)
})

test('[13-3] a function with no rule, in a description written by hand, is open to nobody but the system', async (t) => {
  const { app } = await running(t, {
    change: (description) => {
      const { access: _, ...rest } = description.functions.publicTags
      description.functions.publicTags = rest
    },
  })
  const ada = await addUser(app, 'Ada', ['staff'])
  assert.equal(await codeOf(app.call('publicTags', {}, { as: nobody })), 'T0006')
  assert.equal(await codeOf(app.call('publicTags', {}, { as: ada })), 'T3101')
  assert.deepEqual(await app.call('publicTags', {}, { as: system }), [])
})

test('[20-17b] after a raw SQL write that names a table in touches, a search sees the new vectors', async (t) => {
  const { app } = await running(t)
  await app.call('addDoc', { title: 'east', meaning: [1, 0, 0] }, { as: system })
  await app.call('addDoc', { title: 'north', meaning: [0, 1, 0] }, { as: system })
  const nearest = async (to: number[]) => titles(await app.call('nearest', { to }, { as: nobody }))
  assert.deepEqual(await nearest([1, 0.1, 0]), ['east'])
  assert.deepEqual(await nearest([0.1, 1, 0]), ['north'])
  assert.deepEqual(await nearest([0, 0.1, 1]), ['north'])

  // The statement turns the vector of one row, behind the back of the copy that the store keeps in memory.
  await app.call('turnDocs', { title: 'east', to: [0, 0, 1] }, { as: system })
  assert.deepEqual(await nearest([0, 0.1, 1]), ['east'])
  assert.deepEqual(await nearest([1, 0.1, 0]), ['north'])
  await app.call('turnDocs', { title: 'north', to: [1, 0, 0] }, { as: system })
  assert.deepEqual(await nearest([1, 0.1, 0]), ['north'])
})

test('[21-20@4] change.done, row.changed and call.failed are each heard once, with the fields of their row', async (t) => {
  const { app, engine } = await running(t)
  const heard: [string, Record<string, unknown>][] = []
  for (const event of ['change.done', 'row.changed', 'call.failed'] as const)
    engine.on(event, (told) => void heard.push([event, { ...told }]))
  const ada = await addUser(app, 'Ada', ['staff'])
  heard.length = 0

  const note = Object(await app.call('addNote', { title: 'heard' }, { as: ada }))
  assert.deepEqual(
    [...heard],
    [
      ['row.changed', { app, table: 'notes', id: note.id, kind: 'added' }],
      ['change.done', { app, name: 'addNote', caller: ada, touched: [{ table: 'notes', ids: [note.id] }] }],
    ],
  )

  // A read raises nothing, and neither does a change that was undone, but for its failure.
  heard.length = 0
  await app.call('countNotes', {}, { as: ada })
  assert.equal(heard.length, 0)
  await assert.rejects(app.call('fails', { title: 'undone' }, { as: ada }))
  assert.equal(heard.length, 1)
  const [event, told] = heard[0]
  assert.equal(event, 'call.failed')
  assert.deepEqual(Object.keys(told).sort(), ['app', 'caller', 'error', 'name'])
  assert.equal(told.app, app)
  assert.equal(told.name, 'fails')
  assert.deepEqual(told.caller, ada)
  assert.equal(Object(told.error).code, 'not-today')

  // A call that the door refuses is a failed call too, and one that nests is heard for each function that failed.
  heard.length = 0
  await assert.rejects(app.call('nothing', {}, { as: ada }))
  await assert.rejects(app.call('callsClosed', {}, { as: ada }))
  assert.deepEqual(
    heard.map(([name, one]) => [name, one.name, Object(one.error).code]),
    [
      ['call.failed', 'nothing', 'T0001'],
      ['call.failed', 'closed', 'T3101'],
      ['call.failed', 'callsClosed', 'T3101'],
    ],
  )

  // A handler that throws stops neither the call nor the other handlers.
  heard.length = 0
  engine.on('change.done', () => {
    throw new Error('a handler of the program broke')
  })
  const seen: string[] = []
  engine.on('change.done', (told) => void seen.push(told.name))
  await app.call('addTag', { name: 'still added' }, { as: ada })
  assert.deepEqual(seen, ['addTag'])
  assert.equal(heard.filter(([name]) => name === 'change.done').length, 1)
  // An action that calls a change twice makes two writes, each heard as its own.
  heard.length = 0
  assert.equal(await app.call('addTwo', { title: 'pair' }, { as: ada }), 3)
  assert.deepEqual(
    heard.map(([name, one]) => [name, one.name ?? one.kind]),
    [
      ['row.changed', 'added'],
      ['change.done', 'addNote'],
      ['row.changed', 'added'],
      ['change.done', 'addNote'],
    ],
  )
})
