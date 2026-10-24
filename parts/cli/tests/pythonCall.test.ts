import assert from 'node:assert/strict'
import { test } from 'node:test'
import { logOf, opened, sharedPython, untilWithin } from './pythonApps.ts'

const shared = sharedPython('call')

/** Answers the error that a promise was refused with: a test reads its code and its words. */
async function refusal(
  promise: Promise<unknown>,
): Promise<{ code?: string; message: string; status?: number; fields?: unknown }> {
  try {
    await promise
  } catch (error) {
    return Object(error)
  }
  return assert.fail('the call was answered')
}

test('[25-13] each type of the input reaches run as its row of the Python side says: a date as text in the standard form, a link as its id, and a file as the path of a copy in the folder of the call, named by the engine', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const [customer] = await app
    .write([{ add: 'customers', values: { name: 'Lovelace' } }], { as: 'system' })
    .then((rows) => [Object(Array.isArray(rows) ? rows[0] : rows)])
  const id = String(await app.call('putFile', { text: 'the words of the file' }, { as: ada }))
  const seen = Object(
    await app.call(
      'echo',
      {
        t: 'a text',
        n: 2.5,
        b: true,
        d: '2026-10-15T12:30:00.000Z',
        on: '2026-10-15',
        c: 'red',
        l: customer.id,
        many: [1, 2],
        o: { x: 3 },
        j: { any: ['thing'] },
        f: id,
      },
      { as: ada },
    ),
  )
  assert.deepEqual(seen.t, ['str', 'a text'])
  assert.deepEqual(seen.n, ['float', 2.5])
  assert.deepEqual(seen.b, ['bool', true])
  assert.deepEqual(seen.d, ['str', '2026-10-15T12:30:00.000Z'])
  assert.deepEqual(seen.on, ['str', '2026-10-15'])
  assert.deepEqual(seen.c, ['str', 'red'])
  assert.deepEqual(seen.l, ['str', customer.id])
  assert.deepEqual(seen.many, ['list', [1, 2]])
  assert.deepEqual(seen.o, ['dict', { x: 3 }])
  assert.deepEqual(seen.j, ['dict', { any: ['thing'] }])
  assert.equal(seen.f.text, 'the words of the file')
  assert.equal(seen.f.inFolder, true)
  // The copy is named by the engine, with the ending of its kind: never by what the sender named it.
  assert.match(seen.f.name, /^[\w-]+\.txt$/)
})

test('[25-13] a file that Python wrote into the folder of the call comes back as a file id, and tent.file gives the path of a copy of it; a path outside the folder, straight or through a link, and a file larger than uploadSize are T7119 with nothing stored', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const made = Object(await app.call('writes', { where: 'inside' }, { as: ada }))
  assert.match(String(made.made), /^[\w-]+$/)
  assert.equal(await app.call('fileOf', { id: made.made }, { as: ada }), 'made by Python')
  for (const where of ['outside', 'linked', 'large']) {
    const error = await refusal(app.call('writes', { where }, { as: ada }))
    if (error.code === 'no-links') {
      t.diagnostic(`${where}: this user may make no link to a file on this computer, so the link is not held here`)
      continue
    }
    assert.equal(error.code, 'T7119', where)
    // Each is refused by the engine's check of the path or of the size, not by an error of the code.
    assert.match(error.message, /no file of the folder of its call|uploadSize/, where)
  }
})

test('[25-13] a json value that holds a text id is laid in the rows file as JSON text, and no table of a link is made of it', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  await app.call('addMeta', { body: 'one', meta: { id: 'a1', kind: 'tag' } }, { as: ada })
  const read = Object(await app.call('notesRows', {}, { as: ada }))
  assert.deepEqual(Object.keys(read.tables), ['notes'])
  assert.deepEqual(JSON.parse(String(read.tables.notes.rows[0].meta)), { id: 'a1', kind: 'tag' })
})

test('[25-13] tent.db() holds the rows of each plan as the caller may read them, in the columns of the rows file, with a second table for a plan that follows a link, a table of one row for a count, and no table of the app; system on the definition lifts the rules', async (t) => {
  const { app, user } = await opened(t, shared)
  const [ada, grace] = [await user(), await user()]
  const rows = await app.write([{ add: 'customers', values: { name: 'Lovelace' } }], { as: 'system' })
  const customer = String(Object(Array.isArray(rows) ? rows[0] : rows).id)
  const order = (owner: string, total: number) => ({
    add: 'orders',
    values: { customer, owner, total, placedAt: '2026-10-15T08:00:00.000Z', note: 'kept apart' },
  })
  await app.write(
    [order(String(Reflect.get(Object(ada).user, 'id')), 10), order(String(Reflect.get(Object(grace).user, 'id')), 20)],
    { as: 'system' },
  )
  const read = Object(await app.call('rowsOf', { customer }, { as: ada }))
  assert.deepEqual(Object.keys(read.tables).sort(), ['linked', 'linked_customer', 'orders', 'total'])
  // Ada reads her own order alone, without the column that is private, and with the columns of the rows file.
  assert.equal(read.tables.orders.rows.length, 1)
  assert.equal(read.tables.orders.rows[0].total, 10)
  assert.equal(read.tables.orders.rows[0].placedAt, '2026-10-15T08:00:00.000Z')
  assert.equal(read.tables.orders.columns.includes('note'), false)
  assert.ok(read.tables.orders.columns.includes('id'))
  assert.equal(read.tables.total.rows[0].value, 1)
  assert.equal(read.tables.linked_customer.rows[0].name, 'Lovelace')
  assert.equal(read.tables.linked.rows[0].customer, read.tables.linked_customer.rows[0].id)
  assert.equal(read.wrote, false, 'the file is read-only')
  // With `system` the rules are lifted: both orders.
  const all = Object(await app.call('rowsAll', { customer }, { as: ada }))
  assert.equal(all.tables.orders.rows.length, 2)
})

test('[25-13] a call of a service through tent.call, which uses names, is answered by the service', async (t) => {
  const { app, user } = await opened(t, shared)
  app.standIn('weather', { today: (input: { city: string }) => ({ sky: `clear over ${input.city}` }) })
  assert.deepEqual(await app.call('asksService', { city: 'Ankara' }, { as: await user() }), {
    sky: 'clear over Ankara',
  })
})

test("[25-13] tent.call of a name in uses passes that function's own rule, and its refusal arrives as T3101; of any other name it is T0013", async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const rows = await app.write([{ add: 'customers', values: { name: 'Lovelace' } }], { as: 'system' })
  const customer = String(Object(Array.isArray(rows) ? rows[0] : rows).id)
  const back = Object(await app.call('callsBack', { customer, what: 'back' }, { as: ada }))
  assert.equal(back.name, 'Lovelace')
  assert.equal(back.note, 'from Python')
  assert.equal(back.refused.code, 'T3101')
  // Let out of `run`, a refusal arrives as itself, and so does a name that `uses` does not hold.
  assert.equal((await refusal(app.call('callsBack', { customer, what: 'refused' }, { as: ada }))).code, 'T3101')
  assert.equal((await refusal(app.call('callsBack', { customer, what: 'unknown' }, { as: ada }))).code, 'T0013')
})

test('[25-13] without gpu: true the Python program sees no graphics card, and with it does; the environment holds no key of the engine and nothing of a Python of the person', async (t) => {
  process.env.TENT_SECRET_KEY = 'the-key-of-the-secrets-in-the-environment'
  t.after(() => {
    delete process.env.TENT_SECRET_KEY
  })
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const hidden = Object(await app.call('environment', {}, { as: ada }))
  assert.equal(hidden.cards, '')
  assert.equal(hidden.key, false)
  assert.equal(hidden.userSite, 1)
  assert.equal(hidden.disk, true)
  const shown = Object(await app.call('environmentGpu', {}, { as: ada }))
  assert.notEqual(shown.cards, '')
})

test('[25-13] a number and a list of a number package arrive as numbers and a date as text in the standard form; a value with no plain form is T7119 whose words name the field', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  assert.deepEqual(await app.call('numbers', {}, { as: ada }), {
    one: 3.5,
    many: [1, 2, 3],
    at: '2026-10-15T12:30:00.000Z',
  })
  const error = await refusal(app.call('notANumber', {}, { as: ada }))
  assert.equal(error.code, 'T7119')
  assert.match(error.message, /value/)
})

test("[25-13] [16-2@9d] tent.Fail arrives as the app's own code with status 400; another error is T7119 with its Python trace in the log; a print is a line of the log and the answer is still right", async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  const failed = await refusal(app.call('fails', {}, { as: ada }))
  assert.equal(failed.code, 'out-of-stock')
  assert.equal(failed.message, 'No more of it.')
  assert.deepEqual(failed.fields, { item: 'teapot' })
  const crashed = await refusal(app.call('crashes', {}, { as: ada }))
  assert.equal(crashed.code, 'T7119')
  const errors = JSON.stringify(logOf(dataFolder, 'errors'))
  assert.match(errors, /Traceback/)
  assert.match(errors, /ValueError: a value that is wrong/)
  assert.match(errors, /in deeper/)
  assert.equal(await app.call('prints', {}, { as: ada }), 7)
  // A line of print comes over the standard output, another pipe than the answer: it is waited for.
  const lines = (): string[] => logOf(dataFolder, 'lines').map((one) => `${one.name}: ${one.message}`)
  await untilWithin(
    () => lines().includes('prints: a line that print wrote'),
    'the line that print wrote is in the log',
  )
  assert.ok(lines().includes('prints: a line that tent.log wrote'), lines().join('\n'))
})

test('[25-13] what Python writes to its standard output never reaches the channel, a frame of its own form among it, and reading its standard input finds it closed', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  assert.equal(await app.call('frames', {}, { as: ada }), 'the answer of run')
  assert.equal(await app.call('stdin', {}, { as: ada }), 'the input is closed')
  await untilWithin(
    () => logOf(dataFolder, 'lines').some((one) => String(one.message).includes('forged')),
    'the frame that Python wrote is a line of the log',
  )
})
