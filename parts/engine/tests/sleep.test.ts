import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Clock } from '../../core/internal.ts'
import { sqliteStore } from '../../data/index.ts'
import type { App, EngineOptions } from '../index.ts'
import { bundled, engineOf, nobody, portOf, refusal, system, workFolder } from './apps.ts'
import { untilWithin } from './flowing.ts'
import { notDropped } from './started.ts'

/** A clock that stands still until the test moves it, and that tells how many timers stand on it. */
function countedClock(start: number = Date.UTC(2031, 0, 1)) {
  let moment = start
  let timers: { at: number; run: () => void }[] = []
  const clock: Clock = {
    now: () => moment,
    setTimer(at, run) {
      const timer = { at, run }
      timers.push(timer)
      return () => {
        timers = timers.filter((one) => one !== timer)
      }
    },
  }
  const advance = (ms: number): void => {
    const to = moment + ms
    for (;;) {
      const due = timers.filter((one) => one.at <= to).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      timers = timers.filter((one) => one !== due)
      moment = Math.max(moment, due.at)
      due.run()
    }
    moment = to
  }
  return { clock, advance, timers: () => timers.map((one) => one.at) }
}

/** The stores that the makers made for the app, as a test counts them: how many were opened, and how many closed. */
function countedStores() {
  const counted = { opened: 0, closed: 0 }
  const store = () => {
    const made = sqliteStore()
    counted.opened += 1
    const close = made.close.bind(made)
    return Object.assign(made, {
      close: () => {
        counted.closed += 1
        close()
      },
    })
  }
  return { store, counted }
}

const minutes = (n: number): number => n * 60_000

/** The engine of a test, on a counted clock and with counted stores, and what it heard of apps that sleep and wake. */
function sleepyEngine(t: TestContext, o: EngineOptions & { clock?: ReturnType<typeof countedClock> } = {}) {
  const clock = o.clock ?? countedClock()
  const stores = countedStores()
  const handed: string[] = []
  const engine = engineOf(t, {
    ...o,
    makers: { clock: () => clock.clock, store: stores.store },
    onRequest: (request, next) => {
      handed.push(new URL(request.url).pathname)
      return next(request)
    },
  })
  const heard: string[] = []
  engine.on('app.asleep', ({ dueAt }) => void heard.push(dueAt === undefined ? 'asleep' : `asleep until ${dueAt}`))
  engine.on('app.woke', () => void heard.push('woke'))
  return { engine, clock, stores: stores.counted, handed, heard }
}

/** A call of the app over the network, as a browser makes it, and its answer read. */
async function called(port: number, name: string, input: object = {}): Promise<{ status: number; body: unknown }> {
  const answer = await fetch(`http://localhost:${port}/_t/call/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  return { status: answer.status, body: await answer.json() }
}

const asleepFile = (dataFolder: string): string => join(dataFolder, 'asleep.json')

test('[21-24] an app opened with sleepAfter falls asleep when nothing used it, a request for it wakes it after onRequest, and two requests during the waking are both answered', async (t) => {
  const bundle = await bundled(t, { project: 'sleepy' })
  const { engine, clock, stores, handed, heard } = sleepyEngine(t)
  const dataFolder = join(workFolder(t), 'data')
  const app = await engine.open(bundle.folder, { dataFolder, mode: 'test', sleepAfter: '10 minutes' })
  const port = portOf(dataFolder)
  await app.call('addMark', { what: 'one' }, { as: nobody })
  clock.advance(minutes(9))
  assert.deepEqual(heard, [], 'it was used nine minutes ago')
  clock.advance(minutes(2))
  await untilWithin(() => heard.length === 1, 'the app fell asleep')
  // It was used from outside since its daily upkeep last ran, at its opening: that upkeep is what is due of it.
  const daily = Date.UTC(2031, 0, 1) + minutes(24 * 60)
  assert.deepEqual(heard, [`asleep until ${daily}`])
  assert.deepEqual([stores.opened, stores.closed], [1, 1], 'its store was closed')
  assert.deepEqual(clock.timers(), [daily], 'one timer stands on its clock, at its daily upkeep')
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(asleepFile(dataFolder), 'utf8'))).sort(), [
    'dueAt',
    'names',
    'version',
  ])
  assert.ok(existsSync(join(dataFolder, 'engine.json')), 'engine.json stands while the app sleeps')
  // What was kept answers; a member that needs the open app says how to wake it.
  assert.equal(app.description.app.name, 'sleepy')
  const at = await refusal(Promise.resolve().then(() => app.at()))
  assert.equal(at.code, 'T0013')
  assert.match(String(at.fix), /await app\.ready\(\)/)
  // Health neither wakes it nor counts as a use, and is answered as ready.
  const health = await fetch(`http://localhost:${port}/_t/health`)
  assert.equal(health.status, 200)
  assert.equal(Reflect.get(Object(Reflect.get(Object(await health.json()), 'value')), 'app'), 'sleepy')
  assert.equal(stores.opened, 1)
  // Two requests that arrive during the waking are both answered, after onRequest saw each.
  const [first, second] = await Promise.all([called(port, 'allMarks'), called(port, 'allMarks')])
  assert.deepEqual([first.status, second.status], [200, 200])
  assert.equal(Reflect.get(Object(first.body), 'value').length, 1)
  assert.deepEqual(handed.filter((one) => one === '/_t/call/allMarks').length, 2)
  assert.deepEqual([stores.opened, heard], [2, [`asleep until ${daily}`, 'woke']])
  assert.equal(existsSync(asleepFile(dataFolder)), false, 'the file is removed as the first act of a waking')
})

test('[21-24] a run of an app that sleeps wakes it at its time, also after the program was started again, by asleep.json', async (t) => {
  const bundle = await bundled(t, { project: 'sleepy' })
  const clock = countedClock()
  const dataFolder = join(workFolder(t), 'data')
  const one = sleepyEngine(t, { clock })
  const app = await one.engine.open(bundle.folder, { dataFolder, mode: 'test', sleepAfter: '10 minutes' })
  const { run } = notDropped(await app.start('napping', undefined, { as: system }))
  await untilWithin(() => app.runs.read(run)?.state === 'waiting', 'the run waits')
  clock.advance(minutes(11))
  await untilWithin(() => one.heard.length === 1, 'the app fell asleep')
  const dueAt = Date.UTC(2031, 0, 1) + minutes(60)
  assert.deepEqual(one.heard, [`asleep until ${dueAt}`])
  assert.deepEqual(clock.timers(), [dueAt], 'one timer stands on its clock, at the moment its run wakes')
  assert.equal(JSON.parse(readFileSync(asleepFile(dataFolder), 'utf8')).dueAt, dueAt)
  // The program ends while the app sleeps, and a new one opens the folder: it is asleep, with its store not opened.
  await one.engine.close()
  const two = sleepyEngine(t, { clock })
  const again = await two.engine.open(bundle.folder, { dataFolder, mode: 'test', sleepAfter: '10 minutes' })
  assert.equal(two.stores.opened, 0, 'a folder that holds asleep.json is taken as asleep')
  clock.advance(minutes(50))
  await untilWithin(() => two.heard.includes('woke'), 'its due moment woke it')
  await again.runs.wait(run)
  const marks = await again.call('allMarks', {}, { as: nobody })
  assert.deepEqual(
    Object(marks).map((row: object) => Reflect.get(row, 'what')),
    ['woke'],
  )
})

test('[21-24] app.ready wakes an app that sleeps; without sleepAfter an app never sleeps; after app.close no request opens it', async (t) => {
  const bundle = await bundled(t, { project: 'sleepy' })
  const { engine, clock, stores, heard } = sleepyEngine(t)
  const sleeping = join(workFolder(t), 'sleeping')
  const awake = join(workFolder(t), 'awake')
  const app: App = await engine.open(bundle.folder, { dataFolder: sleeping, mode: 'test', sleepAfter: '1 minute' })
  const other: App = await engine.open(bundle.folder, { dataFolder: awake, mode: 'test', address: 'other.test' })
  clock.advance(minutes(2))
  await untilWithin(() => heard.length === 1, 'the app fell asleep')
  await app.ready()
  assert.deepEqual(heard, ['asleep', 'woke'])
  assert.equal(typeof app.at().n, 'number')
  assert.equal(stores.closed, 1, 'the app that names no sleepAfter never slept')
  await other.call('allMarks', {}, { as: nobody })
  clock.advance(minutes(2))
  await untilWithin(() => heard.length === 3, 'the app fell asleep again')
  await app.close()
  const port = portOf(awake)
  const answer = await fetch(`http://localhost:${port}/_t/call/allMarks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"input":{}}',
  })
  // The name is answered as one that no app holds, T0017.
  assert.equal(answer.status, 421, 'no request opens an app that was closed')
  assert.equal(stores.opened, 3, 'the closed app was not opened again')
  assert.equal(existsSync(asleepFile(sleeping)), false)
})
