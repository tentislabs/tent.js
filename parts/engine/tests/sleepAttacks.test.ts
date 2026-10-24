import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Clock } from '../../core/internal.ts'
import { sqliteStore } from '../../data/index.ts'
import type { App, EngineOptions } from '../index.ts'
import { dial } from '../borrowed/ws.ts'
import { writeAsleep } from '../sleep/asleepFile.ts'
import { bundled, engineOf, nobody, portOf, system, workFolder } from './apps.ts'
import { untilWithin } from './flowing.ts'
import { notDropped } from './started.ts'

/** A clock that stands still until the test moves it. */
function handClock(start: number = Date.UTC(2031, 0, 1)) {
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
  return { clock, advance }
}

const minutes = (n: number): number => n * 60_000

/** An engine on a hand clock, with the stores it opened counted, which tells what it heard of apps that sleep and wake. */
function sleepyEngine(t: TestContext, o: EngineOptions = {}) {
  const hand = handClock()
  const stores = { opened: 0 }
  const store = () => {
    stores.opened += 1
    return sqliteStore()
  }
  const engine = engineOf(t, { ...o, makers: { clock: () => hand.clock, store } })
  const woke: App[] = []
  const asleep: App[] = []
  engine.on('app.woke', ({ app }) => void woke.push(app))
  engine.on('app.asleep', ({ app }) => void asleep.push(app))
  return { engine, ...hand, stores, woke, asleep }
}

/** Sends one request over a real connection, with the host it names, and answers the status and the body. */
function overTheWire(
  port: number,
  host: string,
  path: string,
  o: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((done, failed) => {
    const sent = httpRequest(
      { host: '127.0.0.1', port, path, method: o.method ?? 'POST', headers: { host, ...o.headers }, agent: false },
      (answer) => {
        let text = ''
        answer.setEncoding('utf8')
        answer.on('data', (part) => {
          text += part
        })
        answer.on('end', () => {
          let body: Record<string, unknown> = {}
          try {
            body = Object(JSON.parse(text))
          } catch {
            body = { text }
          }
          done({ status: answer.statusCode ?? 0, body })
        })
      },
    )
    sent.setTimeout(20_000, () => sent.destroy(new Error('the engine did not answer within twenty seconds')))
    sent.on('error', failed)
    sent.end(o.body)
  })
}

const call = (port: number, host: string, name: string, headers: Record<string, string> = {}) =>
  overTheWire(port, host, `/_t/call/${name}`, {
    body: '{"input":{}}',
    headers: { 'content-type': 'application/json', ...headers },
  })

/** What of an answer two apps answer alike: its status and its body, but for the reference of an error. */
function compared(answer: { status: number; body: Record<string, unknown> }): unknown {
  const error = Object(answer.body.error)
  const { ref: _, ...rest } = error
  return { status: answer.status, body: { ...answer.body, ...(answer.body.error ? { error: rest } : {}) } }
}

test('[05-18.1] a stranger who asks at one moment for the names of many apps that sleep: each is woken once, after onRequest, and the apps that are awake keep answering', async (t) => {
  const bundle = await bundled(t, { project: 'sleepy' })
  const seen: string[] = []
  // The three requests for one name are handed on together, so that each meets the waking of the others.
  const together = new Map<string, (() => void)[]>()
  const gathered = (host: string): Promise<void> =>
    new Promise((done) => {
      const held = [...(together.get(host) ?? []), done]
      together.set(host, held)
      if (held.length === 3) for (const one of held) one()
    })
  // The host bounds the waking in onRequest: it refuses the names it does not let through, and the app stays asleep.
  const { engine, advance, woke, asleep } = sleepyEngine(t, {
    onRequest: async (request, next) => {
      const host = new URL(request.url).hostname
      seen.push(host)
      if (host.startsWith('barred')) return new Response('no', { status: 503 })
      if (host.startsWith('app')) await gathered(host)
      return next(request)
    },
  })
  const work = workFolder(t)
  const count = 12
  const apps: App[] = []
  for (let n = 0; n < count; n += 1)
    apps.push(
      await engine.open(bundle.folder, {
        dataFolder: join(work, `app${n}`),
        mode: 'test',
        address: n % 3 === 0 ? `barred${n}.test` : `app${n}.test`,
        sleepAfter: '10 minutes',
      }),
    )
  const awake = await engine.open(bundle.folder, {
    dataFolder: join(work, 'awake'),
    mode: 'test',
    address: 'awake.test',
  })
  advance(minutes(11))
  await untilWithin(() => asleep.length === count, 'every app fell asleep')
  const port = portOf(join(work, 'awake'))
  const names = apps.map((_, n) => (n % 3 === 0 ? `barred${n}.test` : `app${n}.test`))
  // Each name three times at one moment, and the app that is awake beside them.
  const storm = names.flatMap((name) => [
    call(port, name, 'allMarks'),
    call(port, name, 'allMarks'),
    call(port, name, 'allMarks'),
  ])
  const beside = call(port, 'awake.test', 'allMarks')
  const answers = await Promise.all(storm)
  assert.equal((await beside).status, 200)
  for (const [n, name] of names.entries()) {
    const barred = name.startsWith('barred')
    const mine = answers.slice(n * 3, n * 3 + 3).map((one) => one.status)
    assert.deepEqual(mine, barred ? [503, 503, 503] : [200, 200, 200], name)
    assert.equal(
      woke.filter((one) => one === apps[n]).length,
      barred ? 0 : 1,
      `${name} was woken ${woke.filter((one) => one === apps[n]).length} times`,
    )
  }
  assert.equal(seen.filter((one) => one.endsWith('.test')).length, names.length * 3 + 1, 'onRequest saw every request')
  await awake.call('allMarks', {}, { as: nobody })
})

test('[05-18.2] a request that the door refuses at its first steps, sent to an app that sleeps, wakes it and is answered as an app that is awake answers it', async (t) => {
  const bundle = await bundled(t, { project: 'sleepy' })
  const { engine, advance, woke, asleep } = sleepyEngine(t)
  const dataFolder = join(workFolder(t), 'data')
  const app = await engine.open(bundle.folder, {
    dataFolder,
    mode: 'test',
    address: 'shop.test',
    sleepAfter: '10 seconds',
  })
  const port = portOf(dataFolder)
  const elsewhere = { origin: 'https://elsewhere.example' }
  // A page of another site, while the app sleeps and while it is awake.
  advance(11_000)
  await untilWithin(() => asleep.length === 1, 'the app fell asleep')
  const sleeping = await call(port, 'shop.test', 'addMark', elsewhere)
  assert.equal(woke.length, 1, 'the request woke the app')
  const awake = await call(port, 'shop.test', 'addMark', elsewhere)
  assert.deepEqual(compared(sleeping), compared(awake))
  assert.notEqual(sleeping.status, 200)
  // The 61st call of a minute, once the app fell asleep after the sixtieth.
  for (let n = 0; n < 60; n += 1) assert.equal((await call(port, 'shop.test', 'allMarks')).status, 200, `call ${n}`)
  advance(11_000)
  await untilWithin(() => asleep.length === 2, 'the app fell asleep again')
  const over = await call(port, 'shop.test', 'allMarks')
  assert.equal(woke.length, 2)
  assert.equal(Object(over.body.error).code, 'T0005', JSON.stringify(over.body))
  assert.deepEqual(compared(over), compared(await call(port, 'shop.test', 'allMarks')))
  assert.deepEqual(await app.call('allMarks', {}, { as: system }), [])
})

test('[05-18.3] an asleep.json that names another app and a far due moment: the names are those of open, and a file that is no file of the current user alone is not read', async (t) => {
  const bundle = await bundled(t, { project: 'sleepy' })
  const work = workFolder(t)
  const { engine, stores, woke } = sleepyEngine(t)
  const other = await engine.open(bundle.folder, {
    dataFolder: join(work, 'other'),
    mode: 'test',
    address: 'other.test',
  })
  const port = portOf(join(work, 'other'))
  const dueAt = Date.UTC(2099, 0, 1)
  // Written as the engine writes it, with the name of the other app.
  const kept = join(work, 'kept')
  mkdirSync(kept)
  writeAsleep(kept, { names: ['other.test'], version: bundle.versionId, dueAt })
  const opened = stores.opened
  const mine = await engine.open(bundle.folder, {
    dataFolder: kept,
    mode: 'test',
    address: 'mine.test',
    sleepAfter: '10 minutes',
  })
  assert.equal(stores.opened, opened, 'a file of the current user for this bundle is taken as asleep')
  await other.call('addMark', { what: 'of the other app' }, { as: nobody })
  const toOther = await call(port, 'other.test', 'allMarks')
  assert.equal(Object(toOther.body.value).length, 1, 'the other app answers its own name')
  assert.equal(woke.length, 0, 'the name in the file finds no app that sleeps')
  assert.equal((await call(port, 'mine.test', 'allMarks')).status, 200)
  assert.deepEqual(woke, [mine], 'the name of open wakes it')
  // A file that the current user did not make alone is not read: the app is opened, and the file removed.
  const planted = join(work, 'planted')
  mkdirSync(planted)
  writeFileSync(
    join(planted, 'asleep.json'),
    JSON.stringify({ names: ['other.test'], version: bundle.versionId, dueAt }),
  )
  const before = stores.opened
  await engine.open(bundle.folder, {
    dataFolder: planted,
    mode: 'test',
    address: 'planted.test',
    sleepAfter: '10 minutes',
  })
  assert.equal(stores.opened, before + 1, 'a file that others may read was read as asleep.json')
  assert.equal(existsSync(join(planted, 'asleep.json')), false)
})

test('[05-18.4] a visitor who holds one live connection open and watches nothing: it is a use, and the app does not fall asleep while it is open', async (t) => {
  const bundle = await bundled(t, { project: 'sleepy' })
  const { engine, advance, asleep } = sleepyEngine(t)
  const dataFolder = join(workFolder(t), 'data')
  await engine.open(bundle.folder, { dataFolder, mode: 'test', sleepAfter: '10 minutes' })
  const port = portOf(dataFolder)
  const origin = `http://localhost:${port}`
  const socket = dial(`${origin}/_t/live`, { origin })
  // The page answers the signs of life, as a page does, and watches nothing.
  let heard = 0
  let closed = false
  socket.each(
    (frame) => {
      heard += 1
      if (String(frame).includes('"alive"')) socket.send('{"t":"alive"}')
    },
    () => {
      closed = true
    },
  )
  await new Promise((done) => setTimeout(done, 300))
  // The time moves in small steps, so that each sign of life is answered as a page answers it.
  for (let n = 0; n < 140; n += 1) {
    advance(5_000)
    await new Promise((done) => setTimeout(done, 15))
  }
  assert.ok(heard > 0, 'the live connection was opened, and the engine asked for signs of life')
  assert.equal(closed, false, 'the engine closed the connection')
  assert.equal(asleep.length, 0, 'the app fell asleep while a live connection was open')
  socket.close()
  await new Promise((done) => setTimeout(done, 200))
  advance(minutes(11))
  await untilWithin(() => asleep.length === 1, 'the app fell asleep once the connection was closed')
})

test('[21-24] a member that waits for a run keeps the app awake for the length of its call, and is answered when the run ends', async (t) => {
  const bundle = await bundled(t, { project: 'sleepy' })
  const { engine, advance } = sleepyEngine(t)
  const dataFolder = join(workFolder(t), 'data')
  const app = await engine.open(bundle.folder, { dataFolder, mode: 'test', sleepAfter: '10 minutes' })
  const { run } = notDropped(await app.start('napping', undefined, { as: system }))
  await untilWithin(() => app.runs.read(run)?.state === 'waiting', 'the run waits')
  let answered = false
  const waited = app.runs.wait(run).then(() => {
    answered = true
  })
  advance(minutes(11))
  await new Promise((done) => setTimeout(done, 50))
  advance(minutes(50))
  await Promise.race([waited, new Promise((done) => setTimeout(done, 5_000))])
  assert.equal(answered, true, 'app.runs.wait was never answered: the app fell asleep under it')
})

test('[21-24] [50-9] an app that keeps a data file for each tenant falls asleep with a run that waits in a closed file, and is woken at its time', async (t) => {
  const bundle = await bundled(t, { project: 'sleepyTeams' })
  const { engine, advance, woke, asleep } = sleepyEngine(t)
  const dataFolder = join(workFolder(t), 'data')
  const app = await engine.open(bundle.folder, { dataFolder, mode: 'test', sleepAfter: '10 minutes' })
  const team = String(Object(await app.call('addTeam', { name: 'North' }, { as: system })).id)
  await app.call('addOrder', { team, title: 'first' }, { as: system })
  await untilWithin(
    () => app.runs.find({ flow: 'onOrder', of: { table: 'teams', id: team } }).length === 1,
    'the run was added',
  )
  // The file of the team falls quiet and closes after a minute, and the app falls asleep after ten.
  advance(minutes(2))
  await new Promise((done) => setTimeout(done, 50))
  advance(minutes(9))
  await untilWithin(() => asleep.length === 1, 'the app fell asleep')
  const dueAt = Date.UTC(2031, 0, 1) + minutes(60)
  const kept = JSON.parse(readFileSync(join(dataFolder, 'asleep.json'), 'utf8'))
  assert.equal(kept.dueAt, dueAt, 'asleep.json holds no moment for the run of the closed file')
  advance(minutes(50))
  await untilWithin(() => woke.length === 1, `the app was not woken at the time of its run, ${dueAt}`, 5_000)
  await untilWithin(
    async () => Object(await app.call('listOrders', { team }, { as: system })).length === 2,
    'the run went on',
    5_000,
  )
})
