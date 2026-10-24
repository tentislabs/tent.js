import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Store, Tx } from '../../data/index.ts'
import { sqliteStore } from '../../data/index.ts'
import { bundled, codeOf, engineOf, refusal, system, testClock, workFolder } from './apps.ts'
import { flowing, marksOf, settle, started, untilWithin, untilState } from './flowing.ts'

const second = 1000

test('[23-3] a change that starts a flow and then fails leaves no run, and one that succeeds leaves exactly one', async (t) => {
  const { app } = await flowing(t)
  assert.equal(await codeOf(app.call('startGreeting', { name: 'Ada', fails: true }, { as: system })), 'not-today')
  await settle()
  assert.deepEqual(app.runs.find({ flow: 'greet' }), [], 'the start was part of the write, which was undone')
  assert.deepEqual(await marksOf(app), [])

  const run = String(await app.call('startGreeting', { name: 'Bob', fails: false }, { as: system }))
  assert.equal(await app.runs.wait(run), 'hello Bob')
  assert.deepEqual(
    app.runs.find({ flow: 'greet' }).map((one) => [one.id, one.input, one.state]),
    [[run, { name: 'Bob' }, 'done']],
    'exactly one run',
  )
  assert.deepEqual(await marksOf(app), ['greeted Bob'])
  // `start` answers the id of its run in an action too, and is refused in a query.
  const second = String(await app.call('startInAction', { name: 'Cy' }, { as: system }))
  assert.equal(await app.runs.wait(second), 'hello Cy')
  assert.equal(await codeOf(app.call('startInQuery', {}, { as: system })), 'T0013')
  assert.equal(app.runs.find({ flow: 'greet' }).length, 2)
})

test('[23-4] [night] a table trigger fires once for each matching row, for 10,000 rows added in one change too', async (t) => {
  const { app } = await flowing(t)
  const customer = String(Object(await app.call('addCustomer', { name: 'Ada', tier: 'plain' }, { as: system })).id)
  await app.call('addOrders', { customer, count: 3, status: 'closed' }, { as: system })
  await app.call('addOrders', { customer, count: 10_000, status: 'open' }, { as: system })
  const written = async (): Promise<unknown> => app.read({ from: 'marks', count: true }, { as: 'system' })
  await untilWithin(async () => (await written()) === 10_000, 'each of the 10,000 runs wrote its mark', 240_000)
  await settle()
  const marks = await marksOf(app)
  assert.equal(marks.length, 10_000, 'no run for a row that the `where` of the trigger does not fit')
  assert.equal(new Set(marks).size, 10_000, 'one run for each row, and none twice')
  assert.ok(marks.every((mark) => /^order [0-9a-z]{26}$/.test(mark)))
  assert.equal(app.runs.find({ flow: 'onOpenOrder', states: ['done'] }).length, 10_000)
  assert.equal(app.runs.find({ flow: 'onGoldOrder' }).length, 0)
})

/** A store that counts the reads of one table by its id that are made inside a write. */
function countingReads(table: string): { store: Store; reads(): number } {
  const store = sqliteStore()
  let reads = 0
  const write = store.write.bind(store)
  store.write = (work, how) =>
    write((tx) => {
      // The write is handed on as it is, but for its reads, which are counted.
      const counting: Tx = {
        add: (...handed) => tx.add(...handed),
        change: (...handed) => tx.change(...handed),
        remove: (...handed) => tx.remove(...handed),
        sql: (...handed) => tx.sql(...handed),
        sqlRead: (...handed) => tx.sqlRead(...handed),
        read(plan, caller) {
          if (plan.from === table && plan.one === 'get') reads += 1
          return tx.read(plan, caller)
        },
      }
      return work(counting)
    }, how)
  return { store, reads: () => reads }
}

test('[23-4] a `where` that reaches through a link fires for the rows whose linked row fits, with one read for each linked row, and the flow is handed the link as an id', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, { project: 'flowing' }, work)
  const counted = countingReads('customers')
  const { clock } = testClock()
  const engine = engineOf(t, { makers: { store: () => counted.store, clock: () => clock } })
  const app = await engine.open(bundle.folder, { dataFolder: join(work, 'data'), mode: 'test' })
  const gold = String(Object(await app.call('addCustomer', { name: 'Ada', tier: 'gold' }, { as: system })).id)
  const plain = String(Object(await app.call('addCustomer', { name: 'Bob', tier: 'plain' }, { as: system })).id)
  await app.call('addOrders', { customer: gold, count: 2, status: 'closed' }, { as: system })
  await app.call('addOrders', { customer: plain, count: 3, status: 'closed' }, { as: system })
  await untilWithin(async () => (await marksOf(app)).length >= 2, 'the two runs for the orders of the gold customer')
  await settle()
  const rows = Object(await app.call('allMarks', {}, { as: system }))
  assert.equal(rows.length, 2, 'the flow ran for the rows whose customer is gold, and for no other')
  for (const row of rows) {
    assert.match(row.what, /^gold [0-9a-z]{26}$/)
    assert.equal(row.by, gold, 'the flow is handed the row as it was written, with the link as an id')
  }
  // A trigger of a change that names columns fires for a change of one of them, with the row before it.
  const order = app.runs.find({ flow: 'onGoldOrder' })[0].event
  const id = String(Object(Object(order).row).id)
  // A change of a column that the trigger does not name asks nothing of the linked row. A change of one that it
  // names reads the linked row once, inside the write, to hold the row against the `where`.
  const before = counted.reads()
  await app.call('changeOrder', { order: id, status: 'sent' }, { as: system })
  const forNone = counted.reads() - before
  await app.call('changeOrder', { order: id, total: 42 }, { as: system })
  assert.equal(
    counted.reads() - before - forNone,
    forNone + 1,
    'one read for the linked row of the row that was written',
  )
  await untilWithin(async () => (await marksOf(app)).length >= 3, 'the run for the changed total')
  await settle()
  const changed = Object(await app.call('allMarks', {}, { as: system })).slice(2)
  assert.equal(changed.length, 1, 'a change of a column that the trigger does not name fires nothing')
  assert.match(changed[0].what, /^total \d to 42$/)
  assert.equal(changed[0].by, 'total')
})

test('[23-15] [16-2@7b] a flow called from a step: the caller waits and gets its answer, a fourth level is T5105, and a call from a query is T0013', async (t) => {
  const { app } = await flowing(t)
  const run = await started(app, 'outer', { name: 'Ada' })
  await untilWithin(
    () => app.runs.find({ flow: 'inner' })[0]?.state === 'waiting',
    'the innermost run waits for a person',
  )
  const [inner] = app.runs.find({ flow: 'inner' })
  const [middle] = app.runs.find({ flow: 'middle' })
  // Each called run names the run and the step that called it, and the run at the top of the calls.
  assert.deepEqual([middle.parent, middle.parentStep, middle.top], [run, { name: 'call middle', repeat: 1 }, run])
  assert.deepEqual([inner.parent, inner.parentStep, inner.top], [middle.id, { name: 'call inner', repeat: 1 }, run])
  // A run that waits for a run it called waits, and is no run that works.
  assert.equal(app.runs.read(run)?.state, 'waiting')
  assert.equal(app.runs.read(middle.id)?.state, 'waiting')
  app.runs.approve(inner.id, 'go on')
  assert.deepEqual(await app.runs.wait(run), { name: 'Ada', approved: true })
  assert.deepEqual(await marksOf(app), ['inner Ada'])

  // Called runs are three deep: one more fails its call with T5105.
  const deep = await started(app, 'deepOne')
  assert.equal(await codeOf(app.runs.wait(deep)), 'T5105')
  const [third] = app.runs.find({ flow: 'deepThree' })
  assert.equal(third.state, 'failed')
  assert.equal(third.steps[0].error?.code, 'T5105')
  assert.match(String(third.steps[0].error?.message), /callDepth/)
  assert.equal(app.runs.find({ flow: 'greet' }).length, 0, 'no run was added for the fourth level')

  assert.equal(await codeOf(app.call('flowInQuery', {}, { as: system })), 'T0013')
  // From an action a flow is called and waited for, and its answer is the answer of the call.
  assert.equal(await app.call('callGreet', { name: 'Cy' }, { as: system }), 'hello Cy')
})

test('[23-15] the program stopped while a caller waits for a called run starts no second run', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, { project: 'flowing' }, work)
  const dataFolder = join(work, 'data')
  const first = engineOf(t)
  const app = await first.open(bundle.folder, { dataFolder, mode: 'test' })
  const run = await started(app, 'outer', { name: 'Ada' })
  await untilWithin(
    () => app.runs.find({ flow: 'inner' })[0]?.state === 'waiting',
    'the innermost run waits for a person',
  )
  await first.close()

  const second = engineOf(t)
  const again = await second.open(bundle.folder, { dataFolder, mode: 'test' })
  await settle()
  const [inner] = again.runs.find({ flow: 'inner' })
  again.runs.approve(inner.id, 'go on')
  assert.deepEqual(await again.runs.wait(run), { name: 'Ada', approved: true })
  for (const flow of ['outer', 'middle', 'inner'])
    assert.equal(again.runs.find({ flow }).length, 1, `one run of ${flow}, after the restart too`)
  assert.deepEqual(await marksOf(again), ['inner Ada'], 'the work of the called run was done once')
})

test('[23-19] [23-26] a step that calls changes and is run twice writes each once, in whatever order the calls land, and starts one run', async (t) => {
  const { app, advance } = await flowing(t)
  const run = await started(app, 'twoChanges')
  await untilState(app, run, 'waiting')
  assert.deepEqual((await marksOf(app)).sort(), ['both: a', 'both: b', 'both: first try'])
  // The second try of the step makes the two calls in the other order, and one call more.
  advance(5 * second)
  const greeting = String(await app.runs.wait(run))
  assert.deepEqual(
    (await marksOf(app)).filter((mark) => mark.startsWith('both')).sort(),
    ['both: a', 'both: b', 'both: first try', 'both: only the second try'],
    'each change was written once, and the change that only the second try calls was carried out',
  )
  // `start` inside a step that runs twice starts one run.
  assert.equal(app.runs.find({ flow: 'greet' }).length, 1)
  assert.equal(await app.runs.wait(greeting), 'hello from a step')
  assert.equal(app.runs.read(greeting)?.parent, undefined, "a started run is nobody's child")
})

test('[23-24] a flow given an input that does not fit its `input` is refused with T0002, when started and when called', async (t) => {
  const { app } = await flowing(t)
  const refused = await refusal(app.start('greet', { name: 7 }, { as: system }))
  assert.equal(refused.code, 'T0002')
  assert.deepEqual(refused.fields, { name: 'type' })
  assert.equal(await codeOf(app.start('greet', { name: 'Ada', more: true }, { as: system })), 'T0002')
  assert.equal(await codeOf(app.start('greet', undefined, { as: system })), 'T0002')
  assert.equal(await codeOf(app.call('startBadly', {}, { as: system })), 'T0002', '`start` in code')
  assert.equal(await codeOf(app.call('callGreetBadly', {}, { as: system })), 'T0002', 'a call of the flow in code')
  assert.equal(await codeOf(app.call('greet', { name: 7 }, { as: system })), 'T0002', 'a call of the flow by a program')
  assert.equal(await codeOf(app.start('nothing', {}, { as: system })), 'T0001')
  await settle()
  assert.deepEqual(app.runs.find({}), [], 'no run was added')
})

test('[23-27] a wait for an event with `where` is woken by the event that fits and by no other', async (t) => {
  const { app, advance } = await flowing(t)
  const mine = await started(app, 'awaitShipping', { order: 'o1' })
  const other = await started(app, 'awaitShipping', { order: 'o2' })
  await untilState(app, mine, 'waiting')
  await untilState(app, other, 'waiting')
  await app.call('ship', { order: 'o3', carrier: 'slow' }, { as: system })
  await settle()
  assert.equal(app.runs.read(mine)?.state, 'waiting', 'an event for another order wakes no run')
  await app.call('ship', { order: 'o1', carrier: 'fast' }, { as: system })
  assert.equal(await app.runs.wait(mine), 'shipped by fast')
  assert.equal(app.runs.read(other)?.state, 'waiting')
  // The event also starts the flow whose trigger it is, once for each time it was emitted.
  await untilWithin(async () => (await marksOf(app)).length === 2, 'the two runs that the two events started')
  assert.deepEqual((await marksOf(app)).sort(), ['event order.shipped o1', 'event order.shipped o3'])
  // A wait that no event answers gives up at its `timeout`.
  advance(2 * 86_400_000)
  assert.equal(await app.runs.wait(other), 'never shipped')
  // An event is part of the write of a change: outside one it is refused.
  assert.equal(await codeOf(app.call('emitInAction', {}, { as: system })), 'T0013')
})
