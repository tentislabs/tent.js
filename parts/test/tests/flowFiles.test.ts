import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import type { Desk } from './desks.ts'
import { addOrder, addTeam, appIn, command, dataPlace, fileOf, listed, logLines, pairOf, readFile } from './desks.ts'
import { moment, until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const
const day = '1 day'

// The flows that these tests add to the project of the desk. A step that matters adds a line or an order, so a
// test counts in the files how often it was carried out.
const flows = `import { emit, change, event, flow, input, text } from 'tentjs'
import { addLine, addOrder } from '../functions/functions'
import { orders } from '../tables/tables'

// Started by each order whose title begins with "wait": it lives in the file of the order's team, waits, and adds a line.
export const onOrder = flow('onOrder', {
  on: orders.added({ where: { title: { startsWith: 'wait' } } }),
  run: async ({ event, step }) => {
    await step('first', () => event.row.title)
    await step.wait('1 day')
    await step('line', () => addLine({ team: event.row.team, order: event.row.id, qty: 1 }))
  },
})

let failedOnce = false

// Started by an order whose title begins with "copy": a step adds an order to the team named in its code, and
// fails once after that call, so that the step is made twice.
export const onCopy = flow('onCopy', {
  on: orders.added({ where: { title: { startsWith: 'copy' } } }),
  run: async ({ event, step }) => {
    await step(
      'copy',
      async () => {
        const made = await addOrder({ team: String(event.row.code), title: 'a copy' })
        if (!failedOnce) {
          failedOnce = true
          throw new Error('the first making fails after its call')
        }
        return made
      },
      { tries: 2 },
    )
  },
})

// Started by an order whose title begins with "pay": it waits for the event that says the order is paid.
export const awaitPay = flow('awaitPay', {
  on: orders.added({ where: { title: { startsWith: 'pay' } } }),
  run: async ({ event: added, step }) => {
    const paid = await step.waitFor(event('paid'), { where: { order: added.row.id } })
    if ('timedOut' in paid) return 'never'
    await step('line', () => addLine({ team: added.row.team, order: added.row.id, qty: 2 }))
    return 'paid'
  },
})

// Listens to the same event: started once for each, in the file where it was emitted.
export const onPaid = flow('onPaid', {
  on: event('paid'),
  run: async ({ event, step }) => step('seen', () => event.data.order),
})

// Says that an order is paid, in a write of the shared file.
export const markPaid = change('markPaid', {
  access: 'signedIn',
  input: { order: text() },
  run: ({ input: given }) => {
    emit('paid', { order: given.order })
  },
})

// Adds a line in the file of a team, and in that write says that an order of another team is paid.
export const payIn = change('payIn', {
  access: 'signedIn',
  input: { team: text(), order: text(), paid: text() },
  run: ({ db, input: given }) => {
    db.lines.of(given.team).add({ order: given.order, qty: 5 })
    emit('paid', { order: given.paid })
  },
})

// A run that waits a day, of a flow whose runs move to a new version where their steps still match.
export const onMoved = flow('onMoved', {
  on: orders.added({ where: { title: { startsWith: 'move' } } }),
  moveRuns: 'whenSafe',
  run: async ({ step }) => {
    await step.wait('1 day')
    return 'moved on'
  },
})

// One run of it works at a time in each file.
export const onSlow = flow('onSlow', {
  on: orders.added({ where: { title: { startsWith: 'slow' } } }),
  together: { max: 1 },
  run: async ({ step }) => step('work', () => new Promise((done) => setTimeout(() => done('worked'), 400))),
})
`

/** A copy of the project of the desk with the flows of these tests, and a change to its tables where one is given. */
function deskProject(t: TestContext, tables?: (written: string) => string): string {
  const project = copyOf(t, 'desk')
  mkdirSync(join(project, 'flows'), { recursive: true })
  writeFileSync(join(project, 'flows', 'flows.ts'), flows)
  const file = join(project, 'tables', 'tables.ts')
  if (tables) writeFileSync(file, tables(readFileSync(file, 'utf8')))
  return project
}

/** A test app of the desk with the flows of these tests. */
const deskWithFlows = (t: TestContext): Promise<Desk> => appIn(t, deskProject(t))

/** Builds another version of the desk, and answers the folder of its bundle. */
async function versionOf(t: TestContext, tables: (written: string) => string): Promise<string> {
  const project = deskProject(t, tables)
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  return built.bundleFolder
}

const teamFile = (team: string) => ({ table: 'teams', id: team })

/** The runs of a flow in the file of a team, the oldest first. */
const runsIn = (app: TestApp, team: string, flow: string) => app.runs.find({ flow, of: teamFile(team) }).reverse()

/** Answers what a read answers, and false while the file it reads is being brought up: it is read again then. */
function ready(read: () => boolean): boolean {
  try {
    return read()
  } catch (error) {
    if (error instanceof Error && error.name === 'NotReady') return false
    throw error
  }
}

/** Waits until the newest run of a flow in the file of a team stands in a state, and answers its id. */
async function untilRun(app: TestApp, team: string, flow: string, state: string): Promise<string> {
  const newest = () => runsIn(app, team, flow).at(-1)
  await until(`${flow} is ${state}`, () => ready(() => newest()?.state === state), 2000).catch((error: unknown) => {
    throw new Error(`${String(error)}: ${JSON.stringify(newest() ?? 'no run').slice(0, 600)}`)
  })
  return newest()?.id ?? ''
}

/** The lines of the file of a team, read from the file itself, with no engine in between. */
const linesIn = (desk: Desk, team: string): Record<string, unknown>[] =>
  readFile(fileOf(desk.dataFolder, team), 'SELECT "qty" FROM "lines"').map((row) => ({ qty: row.qty }))

/** Whether the file of a team is open, as the directory says. */
const isOpen = async (desk: Desk, team: string): Promise<boolean | undefined> =>
  (await listed(desk.app, desk.dataFolder)).files.find((one) => one.id === team)?.open

test('[50-9] [50-6@7b] a trigger on a table of a tenant adds its run in that write and in that file, a run that waits in a closed file is woken at its time and once, and tent data files says what is due', async (t) => {
  const desk = await deskWithFlows(t)
  const { app } = desk
  const north = await addTeam(app, 'North')
  const order = await addOrder(app, north, 'wait for a line')
  const run = await untilRun(app, north, 'onOrder', 'waiting')
  // The id of the run names its file, and the run stands in that file and in no other.
  assert.equal(run.split('.').slice(1).join('.'), `teams.${north}`)
  assert.deepEqual(app.runs.find({ flow: 'onOrder' }), [])
  assert.deepEqual(
    readFile(fileOf(desk.dataFolder, north), 'SELECT "id" FROM "_t_runs"').map((row) => row.id),
    [run],
  )
  assert.equal(app.runs.read(run)?.state, 'waiting')
  // The file falls quiet and closes; its row says when its run must wake.
  app.clock.advance('2 minutes')
  await moment(30)
  assert.equal(await isOpen(desk, north), false)
  const row = (await listed(app, desk.dataFolder, { due: true })).files.find((one) => one.id === north)
  assert.ok(row?.due !== undefined, 'the file says when its run is due')
  // A minute before its time the file stays closed; at its time it is opened, and the run goes on once.
  app.clock.advance('1430 minutes')
  await moment(30)
  assert.equal(await isOpen(desk, north), false)
  app.clock.advance('10 minutes')
  await untilRun(app, north, 'onOrder', 'done')
  assert.deepEqual(linesIn(desk, north), [{ qty: 1 }])
  app.clock.advance('3 days')
  await moment(30)
  assert.deepEqual(linesIn(desk, north), [{ qty: 1 }])
  assert.ok(order)
})

test('[50-9] after a kill, a run in a file that was open is still woken, and once', async (t) => {
  const desk = await deskWithFlows(t)
  const { app } = desk
  const south = await addTeam(app, 'South')
  await addOrder(app, south, 'wait after a kill')
  const run = await untilRun(app, south, 'onOrder', 'waiting')
  // The file stands open when the program is killed: its row is marked open, and says nothing of its run yet.
  assert.equal(await isOpen(desk, south), true)
  await app.kill()
  await app.restart()
  app.clock.advance(day)
  // The file was marked open: the engine reads it when it starts again, and finds the run.
  await untilRun(app, south, 'onOrder', 'done').catch(async (error: unknown) => {
    throw new Error(
      `${String(error)} ${JSON.stringify(logLines(desk.dataFolder, ''))} ${JSON.stringify(await listed(app, desk.dataFolder))}`,
    )
  })
  assert.equal(app.runs.read(run)?.state, 'done')
  assert.deepEqual(linesIn(desk, south), [{ qty: 1 }])
})

test('[50-9] a change that a step calls twice, in another file than the run, is carried out once', async (t) => {
  const desk = await deskWithFlows(t)
  const { app } = desk
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  // The run lives in the file of the north; the order that its step adds lives in the file of the south.
  await addOrder(app, north, 'copy to the south', { code: south })
  const run = await untilRun(app, north, 'onCopy', 'waiting')
  app.clock.advance('10 seconds')
  await until('the step was made a second time', () => app.runs.read(run)?.state === 'done', 2000)
  assert.equal(app.runs.read(run)?.steps[0].state, 'done')
  const copies = (await app.rows('orders', { of: south })).filter((one) => one.title === 'a copy')
  assert.equal(copies.length, 1)
  // The second making was answered the first answer: the id of the order that the first one added.
  assert.equal(Reflect.get(Object(app.runs.read(run)?.steps[0].result), 'id'), copies[0].id)
})

test('[50-9] a run that waits for an event is woken by an emit in the shared file, with its file open and closed, and a flow that listens to the event is started once', async (t) => {
  const desk = await deskWithFlows(t)
  const { app } = desk
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  const open = await addOrder(app, north, 'pay while open')
  const closed = await addOrder(app, south, 'pay while closed')
  const first = await untilRun(app, north, 'awaitPay', 'waiting')
  const second = await untilRun(app, south, 'awaitPay', 'waiting')
  await app.call('markPaid', { order: open }, system)
  await until('the open file heard it', () => app.runs.read(first)?.state === 'done', 2000)
  assert.equal(await app.runs.wait(first), 'paid')
  // The second file falls quiet and closes: the directory says which event its run waits for.
  app.clock.advance('2 minutes')
  await moment(30)
  assert.equal(await isOpen(desk, south), false)
  await app.call('markPaid', { order: closed }, system)
  await until(
    'the closed file was opened and heard it',
    () => ready(() => app.runs.read(second)?.state === 'done'),
    2000,
  ).catch((error: unknown) => {
    throw new Error(`${String(error)} ${JSON.stringify(logLines(desk.dataFolder, ''))}`)
  })
  assert.deepEqual(linesIn(desk, south), [{ qty: 2 }])
  // The flow that listens to the event ran once for each, in the shared file where the event was emitted.
  await until('both events were seen', () => app.runs.find({ flow: 'onPaid', states: ['done'] }).length === 2, 2000)
  assert.deepEqual(
    app.runs
      .find({ flow: 'onPaid' })
      .map((one) => one.steps[0].result)
      .sort(),
    [closed, open].sort(),
  )
})

test('[50-9] together holds for each file, and runs.find with of all finds a run in a closed file', async (t) => {
  const desk = await deskWithFlows(t)
  const { app } = desk
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'slow one')
  await addOrder(app, north, 'slow two')
  await addOrder(app, south, 'slow three')
  await until('a run of each file works', () =>
    [north, south].every((team) => runsIn(app, team, 'onSlow').some((one) => one.state === 'running')),
  )
  // One run of the flow works in each file: the second of the north waits its turn, and the south does not wait for it.
  assert.deepEqual(
    runsIn(app, north, 'onSlow').map((one) => one.state),
    ['running', 'queued'],
  )
  await until(
    'every run ended',
    () => [north, south].every((team) => runsIn(app, team, 'onSlow').every((one) => one.state === 'done')),
    2000,
  )
  // A run that waits in a file that is closed is found by `of: 'all'`.
  await addOrder(app, south, 'wait in a closed file')
  const waiting = await untilRun(app, south, 'onOrder', 'waiting')
  app.clock.advance('2 minutes')
  await moment(30)
  assert.equal(await isOpen(desk, south), false)
  const found = await app.runs.find({ of: 'all', flow: 'onOrder', states: ['waiting'] })
  assert.deepEqual(
    found.map((one) => one.id),
    [waiting],
  )
  assert.equal((await app.runs.find({ of: 'all', flow: 'onSlow' })).length, 3)
  // A version that the run is pinned to is needed while its file stays closed.
  assert.deepEqual(
    app
      .versions()
      .filter((one) => one.needed)
      .map((one) => one.running),
    [true],
  )
})

test('[50-9] [16-4@7b] a run that waits for an event is woken by an emit in the file of another tenant, also after a kill between the commit and the handing on, and the flow that listens is started once, in the file of the emit', async (t) => {
  const desk = await deskWithFlows(t)
  const { app } = desk
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  const waits = await addOrder(app, north, 'pay from the south')
  const run = await untilRun(app, north, 'awaitPay', 'waiting')
  const there = await addOrder(app, south, 'an order of the south')
  await app.call('payIn', { team: south, order: there, paid: waits }, system)
  await until('the run of the north heard it', () => ready(() => app.runs.read(run)?.state === 'done'), 2000)
  assert.deepEqual(linesIn(desk, south), [{ qty: 5 }])
  assert.deepEqual(
    runsIn(app, south, 'onPaid').map((one) => one.steps[0]?.result),
    [waits],
  )
  assert.deepEqual(runsIn(app, north, 'onPaid'), [])

  // The program is killed right after the commit: what was kept in the write of the south is handed on when it starts again.
  const later = await addOrder(app, north, 'pay after a kill')
  const second = await untilRun(app, north, 'awaitPay', 'waiting')
  app.clock.advance('2 minutes')
  await moment(30)
  const call = app.call('payIn', { team: south, order: there, paid: later }, system)
  await call
  await app.kill()
  await app.restart()
  await until('the run heard it after the kill', () => ready(() => app.runs.read(second)?.state === 'done'), 2000)
  assert.equal(await app.runs.wait(second), 'paid')
  assert.equal(
    readFile(fileOf(desk.dataFolder, south), 'SELECT count(*) AS n FROM "_t_sent"')[0].n,
    0,
    'what was kept is gone once it was handed on',
  )
  // The table that keeps such an event holds exactly its columns.
  assert.deepEqual(
    readFile(fileOf(desk.dataFolder, south), "SELECT name FROM pragma_table_info('_t_sent')").map((row) => row.name),
    ['id', 'event', 'data', 'at'],
  )
})

test('[50-9] a version that a run in a closed file is pinned to is not dropped, the facts name its steps, and a hard switch is refused for it, and stops it with stop', async (t) => {
  const desk = await deskWithFlows(t)
  const { app } = desk
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'wait in a closed file')
  const run = await untilRun(app, north, 'onOrder', 'waiting')
  app.clock.advance('2 minutes')
  await moment(30)
  assert.equal(await isOpen(desk, north), false)
  const first = app.versions()[0].id
  // The facts of the check name the steps of the run, which only its closed file holds.
  assert.deepEqual(Object(await app.facts()).waitingStepNames, { onOrder: ['first', 'wait'] })

  // A switch that is not hard is taken: the run keeps its version, which stays loadable and is not dropped.
  const soft = await app.add(
    await versionOf(t, (written) =>
      written.replace('columns: { name: text() },', 'columns: { name: text(), city: text({ optional: true }) },'),
    ),
  )
  assert.equal((await app.switch(soft)).hard, false)
  assert.equal(app.versions().find((one) => one.id === first)?.needed, true)
  assert.equal(await app.drop(first), false)

  // A switch that is hard is refused for the run of the closed file, and with `hard: 'stop'` stops it.
  const hard = await app.add(
    await versionOf(t, (written) =>
      written.replace(
        'columns: { name: text() },',
        "columns: { name: text(), city: text({ optional: true }) },\n  unique: [['name']],",
      ),
    ),
  )
  const refused = await app.switch(hard)
  assert.deepEqual([refused.hard, refused.refused, refused.runs], [true, 'runs', [run]])
  const stopped = await app.switch(hard, { hard: 'stop' })
  assert.deepEqual([stopped.hard, stopped.refused, stopped.stopped], [true, undefined, [run]])
  assert.equal(app.runs.read(run)?.state, 'stopped')
})

test('[50-11@7b] a reader that took over wakes a run that waited in a closed file, at its time and once', async (t) => {
  const bundle = await versionOf(t, (written) => written)
  const pair = await pairOf(t, bundle, dataPlace(t))
  const { writer } = pair
  const north = await addTeam(writer.app, 'North')
  await addOrder(writer.app, north, 'wait for the reader')
  const of = teamFile(north)
  const waiting = (app: typeof writer.app): boolean =>
    ready(() => app.runs.find({ flow: 'onOrder', of }).some((one) => one.state === 'waiting'))
  await until('the run waits on the writer', () => waiting(writer.app), 2000)
  // The file closes on both machines; the reader holds the run in its copy of the file.
  pair.clock.advance('2 minutes')
  await pair.beat(3)
  await until('the reader holds the run', () => waiting(pair.reader.app), 2000)
  // The writer stops; the reader is current no more, and takes over.
  await writer.app.close()
  await pair.beat(8)
  await pair.reader.app.takeOver()
  const [run] = pair.reader.app.runs.find({ flow: 'onOrder', of })
  assert.equal(run?.state, 'waiting')
  pair.clock.advance(day)
  await until(
    'the new writer woke the run',
    () => ready(() => pair.reader.app.runs.read(run.id)?.state === 'done'),
    2000,
  )
  pair.clock.advance('2 days')
  await moment(30)
  const lines = await pair.reader.app.read({ from: 'lines', of: north }, { as: { kind: 'system' } })
  assert.equal(Array.isArray(lines) ? lines.length : -1, 1)
})

test('[15-6@7b] [50-9] tent runs lists the runs of the shared file, of one tenant with --of, and of every file with --all, a closed one too', async (t) => {
  const desk = await deskWithFlows(t)
  const { app, dataFolder } = desk
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'wait in the north')
  await addOrder(app, south, 'wait in the south')
  const [inNorth, inSouth] = [
    await untilRun(app, north, 'onOrder', 'waiting'),
    await untilRun(app, south, 'onOrder', 'waiting'),
  ]
  app.clock.advance('2 minutes')
  await moment(30)
  const ids = async (args: object): Promise<string[]> =>
    Object(await command(app, dataFolder, 'runs', { what: 'list', ...args }))
      .runs.map((one: { id: string }) => one.id)
      .sort()
  assert.deepEqual(await ids({}), [])
  assert.deepEqual(await ids({ of: north }), [inNorth])
  assert.deepEqual(await ids({ all: true }), [inNorth, inSouth].sort())
  // A tenant with no file holds no run.
  assert.deepEqual(await ids({ of: await addTeam(app, 'Nobody') }), [])
  // An empty word names no tenant.
  await assert.rejects(command(app, dataFolder, 'runs', { what: 'list', of: '' }), { code: 'T0002' })
})

test('[50-9] at a switch a waiting run in a closed file of a flow that states moveRuns is moved to the new version', async (t) => {
  const desk = await deskWithFlows(t)
  const { app } = desk
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'move me')
  const run = await untilRun(app, north, 'onMoved', 'waiting')
  app.clock.advance('2 minutes')
  await moment(30)
  assert.equal(await isOpen(desk, north), false)
  const next = await app.add(
    await versionOf(t, (written) =>
      written.replace('columns: { name: text() },', 'columns: { name: text(), city: text({ optional: true }) },'),
    ),
  )
  await app.switch(next)
  assert.equal(app.runs.read(run)?.version, next)
  app.clock.advance('1 day')
  assert.equal(await app.runs.wait(run), 'moved on')
})
