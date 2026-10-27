import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import type { Machines } from './many.ts'
import { beat, codeOf, current, level, machinesOf, readersHeld, send, until } from './many.ts'
import { notDropped } from './started.ts'

const system = { as: 'system' } as const

// The flows that these tests add to the project of the machines. Each step of theirs adds a customer, so a test
// counts on every machine how often a step was carried out.
const flows = `import { flow, text } from 'tentjs'
import { addCustomer } from '../functions/functions'
import { orders } from '../tables/tables'

// Started by each order that is added.
export const noted = flow('noted', {
  on: orders.added(),
  run: async ({ event, step }) => {
    await step('note', () => addCustomer({ name: \`noted \${event.row.title}\` }))
  },
})

// A run that waits a day between its two steps.
export const pause = flow('pause', {
  input: { name: text(), wait: text() },
  run: async ({ input, step }) => {
    await step('before', () => addCustomer({ name: \`before \${input.name}\` }))
    await step.wait(input.wait)
    await step('after', () => addCustomer({ name: \`after \${input.name}\` }))
    return input.name
  },
})

// A run that waits for a yes.
export const asks = flow('asks', {
  run: async ({ step }) => {
    const said = await step.waitFor('ok')
    return 'approved' in said && said.approved ? 'yes' : 'no'
  },
})
`

/** A writer with a near and a far reader, of the project of the machines with the flows of these tests. */
const withFlows = (t: TestContext): Promise<Machines> =>
  machinesOf(t, (folder) => {
    mkdirSync(join(folder, 'flows'), { recursive: true })
    writeFileSync(join(folder, 'flows', 'flows.ts'), flows)
  })

/** The names of the customers that a machine holds, sorted. */
const customers = async (app: TestApp): Promise<string[]> =>
  (await app.rows('customers')).map((row) => String(row.name)).sort()

/** How many customers of a machine carry a name. */
const count = async (app: TestApp, name: string): Promise<number> =>
  (await customers(app)).filter((one) => one === name).length

/** Waits until a run of a machine stands in a state. */
const untilState = (app: TestApp, run: string, state: string): Promise<void> =>
  until(`the run is ${state}`, () => app.runs.read(run)?.state === state)

test('[29-10] a flow runs on the writer alone: with three machines joined, a trigger that fires on a write is fired once', async (t) => {
  const { app, near, far } = await withFlows(t)
  // The write is asked of each machine in turn: a reader hands it to the writer, which fires the trigger.
  for (const [machine, title] of [
    [app, 'one'],
    [near, 'two'],
    [far, 'three'],
  ] as const)
    assert.equal((await send(machine, 'addOrder', { title })).status, 200, title)
  await until('each trigger ended its run', async () => (await customers(app)).length === 3)
  await level(app, near, far)
  for (const machine of [app, near, far]) {
    assert.deepEqual(await customers(machine), ['noted one', 'noted three', 'noted two'])
    // The runs are rows of the data, so a reader reads them as the writer does: one run for each order.
    const runs = await machine.runs.find({ flow: 'noted' })
    assert.deepEqual(
      runs.map((run) => run.state),
      ['done', 'done', 'done'],
    )
  }
  // A timer of the app is the writer's too: a run that waits is woken once, though three machines hold its row.
  const run = notDropped(await app.start('pause', { name: 'a', wait: '1 day' }, system)).run
  await untilState(app, run, 'waiting')
  await level(app, near, far)
  assert.equal(near.runs.read(run)?.state, 'waiting')
  app.clock.advance('1 day')
  await untilState(app, run, 'done')
  await level(app, near, far)
  for (const machine of [app, near, far]) {
    assert.deepEqual([await count(machine, 'before a'), await count(machine, 'after a')], [1, 1])
    assert.equal(machine.runs.read(run)?.state, 'done')
  }
  // In the mode `test` a reader sends a start to its writer, and reads the run that the writer carried out.
  const far2 = notDropped(await far.start('pause', { name: 'b', wait: '1 second' }, system)).run
  await untilState(app, far2, 'waiting')
  app.clock.advance('1 second')
  await untilState(app, far2, 'done')
  await level(app, near, far)
  assert.deepEqual([await count(far, 'before b'), await count(far, 'after b')], [1, 1])
})

test(
  '[29-10] [29-7@7b] after a reader took over, a run that waited goes on from its saved step and fires its timer once, and the runner runs on the new writer',
  readersHeld,
  async (t) => {
    const { app, near, far } = await withFlows(t)
    const run = notDropped(await app.start('pause', { name: 'kept', wait: '1 day' }, system)).run
    await untilState(app, run, 'waiting')
    await level(app, near, far)
    await app.kill()
    await beat(near, 6)
    // While it is a reader it starts no runner: the time of the wait passes, and nothing wakes the run there.
    assert.equal(near.role, 'reader')
    near.clock.advance('1 day')
    await beat(near, 2)
    assert.equal(near.runs.read(run)?.state, 'waiting')
    assert.deepEqual(
      near.runs.read(run)?.steps.map((step) => [step.name, step.state]),
      [
        ['before', 'done'],
        ['wait', 'waiting'],
      ],
    )

    await near.takeOver()
    assert.equal(near.role, 'writer')
    // The new writer takes the run up: its wait is over, its first step is read as it was saved, and its last is carried out.
    await untilState(near, run, 'done')
    assert.equal(await near.runs.wait(run), 'kept')
    assert.deepEqual([await count(near, 'before kept'), await count(near, 'after kept')], [1, 1])
    assert.deepEqual(
      near.runs.read(run)?.steps.map((step) => [step.name, step.state]),
      [
        ['before', 'done'],
        ['wait', 'done'],
        ['after', 'done'],
      ],
    )
    // More time wakes it no second time.
    near.clock.advance('2 days')
    await beat(near, 2)
    assert.equal(await count(near, 'after kept'), 1)

    // The runner runs on the new writer: a trigger fires there once, and a run is started and ended there.
    assert.equal((await send(near, 'addOrder', { title: 'by the new writer' })).status, 200)
    await until(
      'the trigger of the new writer ended its run',
      async () => (await count(near, 'noted by the new writer')) === 1,
    )
    const next = notDropped(await near.start('pause', { name: 'new', wait: '1 hour' }, system)).run
    await untilState(near, next, 'waiting')
    near.clock.advance('1 hour')
    await untilState(near, next, 'done')
    // The far reader follows the new writer and holds what its runs wrote, once each.
    await until(
      'the far reader follows the new writer',
      async () => {
        await beat(far)
        return far.at().epoch === near.at().epoch && far.at().n === near.at().n
      },
      40,
    )
    await current(near, far)
    assert.deepEqual(await customers(far), [
      'after kept',
      'after new',
      'before kept',
      'before new',
      'noted by the new writer',
    ])
    // A reader that waits for a run reads how it ended from its own data.
    assert.equal(await codeOf(far.runs.wait(next)), undefined)
  },
)

test('[29-10] on a reader the runs are read from its own data, and on test data a start, a yes, a no and a stop that code asks a reader for are carried out by the writer', async (t) => {
  const { app, near, far } = await withFlows(t)
  const asked: string[] = []
  for (const machine of [app, near, far]) asked.push(notDropped(await machine.start('asks', undefined, system)).run)
  await until('each run waits', () => asked.every((run) => app.runs.read(run)?.state === 'waiting'))
  await level(app, near, far)
  // Each machine reads the three runs, the newest first, and each with its steps.
  for (const machine of [app, near, far]) {
    const found = await machine.runs.find({ flow: 'asks', states: ['waiting'] })
    assert.deepEqual(
      found.map((run) => run.id),
      [...asked].reverse(),
    )
    assert.deepEqual(
      machine.runs.read(asked[0])?.steps.map((step) => [step.name, step.state]),
      [['ok', 'waiting']],
    )
  }
  assert.equal(far.runs.read('nothere'), undefined)
  assert.equal(await codeOf(near.runs.wait('nothere')), 'T0001')
  // A reader that waits for a run is answered when its own data holds how the run ended.
  const waited = [near.runs.wait(asked[0]), far.runs.wait(asked[1]), codeOf(far.runs.wait(asked[2]))]
  near.runs.approve(asked[0], 'ok')
  far.runs.refuse(asked[1], 'ok')
  far.runs.stop(asked[2])
  await until('the writer carried each out', () =>
    ['done', 'done', 'stopped'].every((state, i) => app.runs.read(asked[i])?.state === state),
  )
  assert.deepEqual(await Promise.all(waited), ['yes', 'no', 'T5106'])
  await level(app, near, far)
  assert.deepEqual(
    asked.map((run) => far.runs.read(run)?.state),
    ['done', 'done', 'stopped'],
  )
})

test('[29-7@7b] an old writer that still runs when its near reader takes over stops its runner with its writes: a run that is due is carried out by the new writer alone', async (t) => {
  const { app, near } = await withFlows(t)
  const run = notDropped(await app.start('pause', { name: 'once', wait: '1 day' }, system)).run
  await untilState(app, run, 'waiting')
  await level(app, near)
  near.cut()
  await beat(app, 7)
  await near.takeOver()
  await until(
    'the old writer was told',
    async () => {
      await beat(app)
      return (await send(app, 'addOrder', { title: 'refused' })).code === 'T0030'
    },
    20,
  )
  // The time of the wait passes on both machines, which share the clock of the test.
  near.clock.advance('1 day')
  await untilState(near, run, 'done')
  await beat(near, 3)
  assert.deepEqual([await count(near, 'before once'), await count(near, 'after once')], [1, 1])
  // The machine that was stopped holds the run as it was when it stopped: it woke nothing and carried nothing out.
  assert.equal(app.runs.read(run)?.state, 'waiting')
  assert.deepEqual(
    app.runs.read(run)?.steps.map((step) => [step.name, step.state]),
    [
      ['before', 'done'],
      ['wait', 'waiting'],
    ],
  )
})

test('[29-7@7b] [night] after taking over under load, each of 200 runs that waited goes on once on the new writer, and each of 100 triggers was fired once', async (t) => {
  const { app, near, far } = await withFlows(t)
  const runs: string[] = []
  for (let i = 0; i < 200; i++) {
    // Half of them are due while no writer runs, and half after the reader took over.
    const wait = i % 2 ? '1 hour' : '3 days'
    runs.push(notDropped(await app.start('pause', { name: `r${i}`, wait }, system)).run)
    if (i % 2 === 0) assert.equal((await send(app, 'addOrder', { title: `o${i}` })).status, 200)
  }
  await until(
    'every run waits and every trigger ended',
    async () =>
      runs.every((run) => app.runs.read(run)?.state === 'waiting') &&
      (await customers(app)).filter((name) => name.startsWith('noted ')).length === 100,
    4000,
  )
  await level(app, near, far)
  await app.kill()
  await beat(near, 6)
  near.clock.advance('1 hour')
  await near.takeOver()
  await until(
    'the runs that were due went on',
    () => runs.every((run, i) => i % 2 === 0 || near.runs.read(run)?.state === 'done'),
    4000,
  )
  assert.ok(runs.every((run, i) => i % 2 === 1 || near.runs.read(run)?.state === 'waiting'))
  near.clock.advance('3 days')
  await until('every run is done', () => runs.every((run) => near.runs.read(run)?.state === 'done'), 4000)
  const held = await customers(near)
  for (let i = 0; i < 200; i++)
    assert.deepEqual(
      [held.filter((name) => name === `before r${i}`).length, held.filter((name) => name === `after r${i}`).length],
      [1, 1],
      `run ${i}`,
    )
  assert.equal(held.filter((name) => name.startsWith('noted ')).length, 100)
  assert.equal(held.length, 500)
})
