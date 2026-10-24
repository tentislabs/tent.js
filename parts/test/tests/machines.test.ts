import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  beat,
  callsOf,
  codeOf,
  current,
  folderOf,
  logRows,
  machinesOf,
  moment,
  send,
  titles,
  until,
  writerOf,
} from './many.ts'

test('[29-2] a reader that starts empty fetches the running version and the data, joins, answers nothing itself until it is current, and then answers what the writer answers', async (t) => {
  const app = await writerOf(t)
  for (const title of ['one', 'two', 'three']) await send(app, 'addOrder', { title })
  const near = await app.reader()
  assert.deepEqual([app.role, near.role], ['writer', 'reader'])
  // The folder of the reader holds the running version and the data, and no half file.
  const folder = folderOf(t, 'reader-2')
  assert.equal(existsSync(join(folder, 'data.db')), true)
  assert.deepEqual(
    readdirSync(folder).filter((name) => name.startsWith('data.db.fetch')),
    [],
  )
  const [version] = readdirSync(join(folder, 'versions'))
  assert.equal(existsSync(join(folder, 'versions', version, 'description.json')), true)
  assert.deepEqual([near.at().n, near.at().sum], [app.at().n, app.at().sum])
  assert.equal(near.description.app.name, 'many')

  // Until it is current it answers nothing itself: a query is handed to the writer, and `/_t/health` is T0029.
  assert.equal(near.at().current, false)
  const before = callsOf(t, 'data', 'listOrders')
  const early = await send(near, 'listOrders')
  assert.equal(early.status, 200)
  assert.equal(Object(early.value).length, 3)
  assert.equal(callsOf(t, 'data', 'listOrders'), before + 1)
  assert.equal(callsOf(t, 'reader-2', 'listOrders'), 0)
  const unwell = await send(near, '', {}, { path: '/_t/health', method: 'GET' })
  assert.deepEqual([unwell.status, unwell.code], [503, 'T0029'])

  // Once it is current it answers what the writer answers, with no request reaching the writer.
  await current(app, near)
  const [mine, theirs] = [await send(near, 'listOrders'), await send(app, 'listOrders')]
  assert.deepEqual(mine.value, theirs.value)
  assert.equal(callsOf(t, 'reader-2', 'listOrders'), 1)
  assert.equal(callsOf(t, 'data', 'listOrders'), before + 2)
  assert.equal((await send(near, '', {}, { path: '/_t/health', method: 'GET' })).status, 200)
  // What the writer writes from now on arrives, and is what the reader answers.
  await send(app, 'addOrder', { title: 'four' })
  assert.equal(near.at().n, app.at().n)
  assert.deepEqual(await titles(near), ['one', 'two', 'three', 'four'])
})

test('[29-2] the machines are listed with their kinds and their numbers, on the writer and on a reader', async (t) => {
  const { app, near, far } = await machinesOf(t)
  await send(app, 'addOrder', { title: 'one' })
  await beat(app)
  const kinds = (rows: { role: string; far: boolean; n: number; current: boolean; take: boolean }[]): string[] =>
    rows.map((one) => `${one.role} ${one.far ? 'far' : 'near'} ${one.n} ${one.current} ${one.take}`)
  const n = app.at().n
  const expected = [`writer near ${n} true true`, `reader near ${n} true true`, `reader far ${n} true false`]
  assert.deepEqual(kinds(app.machines()), expected)
  // A reader holds what its writer last told it: who the machines are, as they stood when one last joined.
  const told = (rows: { role: string; far: boolean; take: boolean }[]): string[] =>
    rows.map((one) => `${one.role} ${one.far} ${one.take}`)
  for (const reader of [near, far])
    assert.deepEqual(told(reader.machines()), ['writer false true', 'reader false true', 'reader true false'])
  const [writer, first, second] = app.machines()
  assert.deepEqual(
    [writer.own, first.own, second.own].map((own) => /^https:\/\/.+\.tent\.test$/.test(String(own))),
    [true, true, true],
  )
  assert.equal(new Set([writer.id, first.id, second.id]).size, 3)
  assert.equal(first.key?.length, 16)
  // The command of the admin channel answers the same on the writer and on a reader, with the epoch.
  for (const [machine, folder] of [
    [app, 'data'],
    [near, 'reader-2'],
  ] as const) {
    const { port, token } = JSON.parse(readFileSync(join(folderOf(t, folder), 'engine.json'), 'utf8'))
    const answer = await machine.request(
      new Request(`http://127.0.0.1:${port}/_t/admin/machines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ args: {} }),
      }),
    )
    const told = Object(await answer.json()).value
    assert.deepEqual(kinds(told.machines), expected, folder)
    assert.equal(told.epoch, app.at().epoch, folder)
  }
})

test('[29-3] a reader answers a query with no request reaching the writer, and a change and an action sent to a reader are carried out by the writer once', async (t) => {
  const { app, near, far } = await machinesOf(t)
  await send(app, 'addOrder', { title: 'by the writer' })
  // A query, and an action that says it changes nothing, are answered by the reader that got them.
  for (const [reader, folder] of [
    [near, 'reader-2'],
    [far, 'reader-3'],
  ] as const) {
    const before = callsOf(t, 'data', 'listOrders') + callsOf(t, 'data', 'peek')
    assert.equal(Object((await send(reader, 'listOrders')).value).length, 1)
    assert.equal((await send(reader, 'peek')).value, 1)
    assert.equal(callsOf(t, 'data', 'listOrders') + callsOf(t, 'data', 'peek'), before)
    assert.equal(callsOf(t, folder, 'listOrders'), 1)
  }
  // A change sent to a reader is carried out by the writer, once, and its answer is passed back.
  const added = await send(near, 'addOrder', { title: 'through the near reader' })
  assert.equal(added.status, 200)
  assert.equal(Object(added.value).title, 'through the near reader')
  assert.equal(callsOf(t, 'data', 'addOrder'), 2)
  assert.equal(callsOf(t, 'reader-2', 'addOrder'), 0)
  assert.deepEqual(await titles(app), ['by the writer', 'through the near reader'])
  // One ref stands in both logs: the line of the reader that handed it on, and the call of the writer.
  const [handed] = logRows(t, 'reader-2', 'calls').filter((row) => row.kind === 'handed')
  assert.match(String(handed.ref), /^[0-9a-z]{8}$/)
  assert.equal(handed.name, '/_t/call/addOrder')
  const [carried] = logRows(t, 'data', 'calls').filter((row) => row.ref === handed.ref)
  assert.deepEqual([carried.name, carried.ok], ['addOrder', 1])
  // The log of the writer holds the address of the caller, as the reader stated it.
  const lines = logRows(t, 'data', 'lines').filter((row) => String(row.data).includes(String(handed.ref)))
  assert.equal(lines.length, 1)
  assert.match(String(lines[0].data), /"from":"10\.9\.\d+\.\d+"/)
  // An action that says it changes nothing and calls a change is refused with T0013, on a reader as on the
  // writer, which a caller is sent as T0009: nothing is written.
  const sneaked = await send(far, 'sneak', { title: 'met the writer' })
  assert.deepEqual([sneaked.status, sneaked.code], [500, 'T0009'])
  assert.deepEqual(await titles(app), ['by the writer', 'through the near reader'])
  // A request that a reader is sent with headers of its sender's own making is answered as its sender's own.
  const made = await send(
    near,
    'listOrders',
    {},
    { headers: { 'tent-reader': 'made up', 'tent-for': '1.2.3.4; https; x' } },
  )
  assert.equal(made.status, 200)
  assert.equal(Object(made.value).length, 2)
  // On the writer, the headers of a reader with no key of a reader behind them are not found.
  assert.equal((await send(app, 'listOrders', {}, { headers: { 'tent-reader': 'made up' } })).code, 'T0001')
  assert.equal((await send(app, 'listOrders', {}, { headers: { 'tent-for': '1.2.3.4; https; x' } })).code, 'T0001')
})

test('[29-3] in the mode test a write that code asks a reader for is carried out by the writer as that caller, and with the writer stopped a handed-on request is T0029', async (t) => {
  const { app, near } = await machinesOf(t)
  const ada = await app.user({ name: 'Ada', roles: [] })
  // `app.as(user).call` of a change and `app.write` on a reader are carried out by the writer.
  const row = await near.as(ada).call('addOrder', { title: 'asked of the reader' })
  assert.equal(Object(row).title, 'asked of the reader')
  await near.write([{ add: 'orders', values: { title: 'written on the reader' } }], { as: 'system' })
  assert.deepEqual(await titles(app), ['asked of the reader', 'written on the reader'])
  assert.equal(callsOf(t, 'data', 'addOrder'), 1)
  assert.equal(callsOf(t, 'reader-2', 'addOrder'), 0)
  await until('the reader holds what it sent on', () => near.at().n === app.at().n)
  // A query is answered by the reader itself.
  const before = callsOf(t, 'data', 'countOrders')
  assert.equal(await near.as(ada).call('countOrders'), 2)
  assert.equal(callsOf(t, 'data', 'countOrders'), before)
  // A restore is the writer's in every mode.
  const mark = await app.mark()
  assert.equal(await codeOf(near.back(mark)), 'T0030')
  // With the writer stopped, a request that is handed on is T0029, and so is a member that code asked for.
  await app.kill()
  const refused = await send(near, 'addOrder', { title: 'nobody carries it out' })
  assert.deepEqual([refused.status, refused.code], [503, 'T0029'])
  assert.equal(await codeOf(near.as(ada).call('addOrder', { title: 'nor this' })), 'T0029')
  // While it is current, the reader still answers what only reads.
  assert.equal(Object((await send(near, 'listOrders')).value).length, 2)
  await moment()
})
