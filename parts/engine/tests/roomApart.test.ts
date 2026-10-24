import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import type { Mailer, OpenOptions, Room, RoomInput } from '../index.ts'
import { apartRoom } from '../index.ts'
import { TentError } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import { NotReady } from '../../data/index.ts'
import { errorIn, errorOut } from '../rooms/callables.ts'
import type { Bundling, Running } from './apps.ts'
import { codeOf, logRows, nobody, refusal, running, system, testClock, userOf } from './apps.ts'

/** What the rooms of a test made and closed, and the mail the app sent. */
interface Counted {
  made: number
  closed: number
  sent: Parameters<Mailer['send']>[0][]
}

/** The test room, as a program makes it, counted. */
function countedRooms(counted: Counted): (input: RoomInput) => Room {
  return (input) => {
    const room = apartRoom(input)
    counted.made += 1
    const close = room.close
    return Object.assign(room, {
      close: () => {
        counted.closed += 1
        return close()
      },
    })
  }
}

/** The project of the room, opened with its code in the test room. */
async function apart(
  t: TestContext,
  o: Bundling & { open?: Partial<OpenOptions>; clock?: Clock } = {},
): Promise<Running & { counted: Counted }> {
  const counted: Counted = { made: 0, closed: 0, sent: [] }
  const mailer: Mailer = {
    send: async (message) => {
      counted.sent.push(message)
      return {}
    },
  }
  const { clock, ...bundling } = o
  const run = await running(t, {
    project: 'apart',
    ...bundling,
    engine: {
      makers: { room: countedRooms(counted), mailer: () => mailer, ...(clock ? { clock: () => clock } : {}) },
    },
  })
  return { ...run, counted }
}

test('[52-6] in the test room a code query that reads three times and calls a query answers at once, a code change that writes twice and calls a change is one write undone whole, a rule of a table that is code holds in a plan and in code, and the clock and the random source are T4101 in a query and answer in an action', async (t) => {
  const { app, engine, bundle } = await apart(t)
  const marks: unknown = Reflect.get(globalThis, 'apartLoaded')
  const loaded = (Array.isArray(marks) ? marks : []).map(String)
  const bundleAt = pathToFileURL(bundle.folder).href
  assert.deepEqual(
    loaded.filter((one) => one.startsWith(bundleAt)),
    [],
    'no module of the bundle loaded in the heap of the engine',
  )
  await app.call('oneWrite', { what: 'first' }, { as: nobody })
  assert.equal(await app.call('threeReads', {}, { as: nobody }), 4, 'each read answered at once, with its rows')
  const done: string[] = []
  engine.on('change.done', ({ name }) => void done.push(name))
  assert.equal(await app.call('twoWrites', { what: 'pair', fails: false }, { as: nobody }), 3)
  assert.deepEqual(done, ['oneWrite', 'twoWrites'], 'the change and the change it called are one write')
  assert.equal(await app.call('oneRead', {}, { as: nobody }), 4)
  assert.equal(await codeOf(app.call('twoWrites', { what: 'lost', fails: true }, { as: nobody })), 'no-more')
  assert.equal(await app.call('oneRead', {}, { as: nobody }), 4, 'a change that failed is undone whole')
  const ada = userOf('ada')
  await app.call('addLetter', { to: 'ada', body: 'for Ada' }, { as: nobody })
  await app.call('addLetter', { to: 'bob', body: 'for Bob' }, { as: nobody })
  const planned: unknown = await app.call('letterPlan', {}, { as: ada })
  assert.deepEqual(
    (Array.isArray(planned) ? planned : []).map((one) => Reflect.get(Object(one), 'body')),
    ['for Ada'],
  )
  assert.equal(await app.call('letterCode', {}, { as: ada }), 1)
  for (const how of ['now', 'random'])
    assert.equal(await codeOf(app.call('clockInQuery', { how }, { as: nobody })), 'T4101', how)
  assert.equal(typeof (await app.call('clockInAction', {}, { as: nobody })), 'number')
})

test('[52-7] in the test room a code query that never ends is T0008 at queryTime, and an action at actionTime, with the room made anew for the next call; code that fills memory is T0037, and the app answers the next call', async (t) => {
  const { app, counted } = await apart(t)
  const began = performance.now()
  assert.equal(await codeOf(app.call('loops', {}, { as: nobody })), 'T0008')
  const took = performance.now() - began
  // The room makes its thread anew at once: the next call is answered once that thread has started.
  const started = (): Promise<void> => new Promise((done) => setTimeout(done, 1500))
  await started()
  assert.ok(took >= 950 && took < 5000, `ended at queryTime, after ${Math.round(took)} ms`)
  assert.equal(await app.call('oneRead', {}, { as: nobody }), 0, 'the next call is answered')
  const later = performance.now()
  assert.equal(await codeOf(app.call('loopsAction', {}, { as: nobody })), 'T0008')
  const tookAction = performance.now() - later
  await started()
  assert.ok(tookAction >= 4950 && tookAction < 12000, `ended at actionTime, after ${Math.round(tookAction)} ms`)
  assert.equal(await app.call('oneRead', {}, { as: nobody }), 0)
  assert.equal(await codeOf(app.call('fills', {}, { as: nobody })), 'T0037')
  await started()
  assert.equal(await app.call('oneRead', {}, { as: nobody }), 0, 'the app answers after the room passed its memory')
  assert.equal(counted.made, 1, 'one room, whose thread was made anew')
})

test('[52-7] in the room of the program an action past its time is T0008, as before', async (t) => {
  const { app } = await running(t, { project: 'apart' })
  assert.equal(await codeOf(app.call('asCaller', { wait: 6000 }, { as: nobody })), 'T0008')
})

test('[52-8] in the test room two actions that wait side by side as two callers each call a query and send mail as their own caller', async (t) => {
  const { app, dataFolder, counted } = await apart(t)
  const [ada, bob] = [userOf('ada'), userOf('bob')]
  const [first, second] = await Promise.all([
    app.call('asCaller', { wait: 200 }, { as: ada }),
    app.call('asCaller', { wait: 50 }, { as: bob }),
  ])
  assert.deepEqual([first, second], ['ada', 'bob'])
  assert.deepEqual(
    counted.sent.map((one) => one.subject).sort(),
    ['ada', 'bob'],
    'the mail of each carries its own caller',
  )
  const asked = logRows(dataFolder, 'calls').filter((one) => one.name === 'whoAmI')
  assert.deepEqual(
    asked.map((one) => one.callerId).sort(),
    ['ada', 'bob'],
    'each query is counted under its own caller',
  )
})

test('[52-5] in the test room a stream of a fetch of 10 MB is pulled piece by piece, a failure of ours is caught as a TentError with its code and fields, an error and a thrown text are T0009 with what they rest on, and a callable kept past its call is T0013', async (t) => {
  const piece = new Uint8Array(64 * 1024).fill(7)
  const server = createServer((_, answer) => {
    answer.writeHead(200, { 'content-type': 'application/octet-stream' })
    let sent = 0
    const more = (): void => {
      while (sent < 10 * 1024 * 1024) {
        sent += piece.length
        if (!answer.write(piece)) return void answer.once('drain', more)
      }
      answer.end()
    }
    more()
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => server.close(() => done())))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const { app, dataFolder } = await apart(t, { open: { mode: 'development' } })
  const fetched: unknown = await app.call('fetchedBytes', { url: `http://127.0.0.1:${port}/big` }, { as: nobody })
  assert.equal(Reflect.get(Object(fetched), 'bytes'), 10 * 1024 * 1024)
  assert.ok(Number(Reflect.get(Object(fetched), 'pieces')) > 1, 'the body was pulled piece by piece')
  assert.equal(await app.call('catches', {}, { as: nobody }), 'not-today {"what":"taken"}')
  const thrown = await refusal(app.call('throwsError', {}, { as: nobody }))
  assert.equal(thrown.code, 'T0009')
  assert.ok(Reflect.get(thrown, 'cause') instanceof RangeError, 'an error of the code crosses as its kind')
  const failed = logRows(dataFolder, 'errors').find((one) => one.name === 'throwsError')
  assert.match(String(failed?.stack), /functions\.ts/, 'its trace points into the source of the app')
  assert.equal(await codeOf(app.call('throwsText', {}, { as: nobody })), 'T0009')
  assert.equal(await app.call('keepSay', {}, { as: nobody }), 'kept')
  assert.equal(await codeOf(app.call('laterSay', {}, { as: system })), 'T0013')
})

test('[52-5] in the test room a file that is not ready, a refusal that carries its place and a stopped call each cross as the same mark, both ways, so the engine steers the call by it as in the program', async (t) => {
  const file = { table: 'teams', id: 'team-1' }
  const marks: Record<string, () => Error> = {
    notReady: () => new NotReady(file),
    refused: () => new TentError('T7111', 'A person did not agree to the call.', { place: { name: 'send', nth: 2 } }),
    stopped: () => new TentError('T5106', 'The run was stopped before it ended.'),
  }
  let next: (() => Error) | undefined
  // The test room, its ways watched: the change the code calls meets the mark the engine raised there.
  const marking = (input: RoomInput): Room =>
    apartRoom({
      ...input,
      ways: {
        ...input.ways,
        runtime(call, word, args) {
          const mark = next
          if (word === 'call' && args[0] === 'refuses' && mark) throw mark()
          return input.ways.runtime(call, word, args)
        },
      },
    })
  const { app } = await running(t, { project: 'apart', engine: { makers: { room: marking } } })
  const seen: Record<string, unknown> = {}
  for (const [name, mark] of Object.entries(marks)) {
    next = mark
    seen[name] = JSON.parse(String(await app.call('seesMark', {}, { as: nobody })))
  }
  assert.deepEqual(seen, {
    notReady: { kind: 'NotReady', code: null, place: null, file },
    refused: { kind: 'TentError', code: 'T7111', place: { name: 'send', nth: 2 }, file: null },
    stopped: { kind: 'TentError', code: 'T5106', place: null, file: null },
  })
  // What crosses back to the engine is rebuilt as the same, so the engine's `instanceof` steers it as in the program.
  for (const [name, mark] of Object.entries(marks)) {
    const back = errorIn(structuredClone(errorOut(mark())))
    assert.equal(back instanceof NotReady, name === 'notReady', name)
    if (back instanceof NotReady) assert.deepEqual(back.file, file)
    if (back instanceof TentError)
      assert.deepEqual([back.code, back.place], [Reflect.get(mark(), 'code'), Reflect.get(mark(), 'place')])
  }
})

/** What the engine told of an app, in order, with a wait for the moment it has told a number of things. */
function toldOf(engine: Running['engine']): { heard: string[]; told(count: number): Promise<void> } {
  const heard: string[] = []
  const waiting: { count: number; done: () => void }[] = []
  const hear = (what: string): void => {
    heard.push(what)
    for (const one of waiting.filter(({ count }) => heard.length >= count)) one.done()
  }
  engine.on('app.asleep', () => hear('asleep'))
  engine.on('app.woke', () => hear('woke'))
  const told = (count: number): Promise<void> =>
    heard.length >= count ? Promise.resolve() : new Promise((done) => void waiting.push({ count, done }))
  return { heard, told }
}

/** Waits until something holds: it looks at what it reads, and for no length of time. */
async function until(holds: () => boolean): Promise<void> {
  while (!holds()) await new Promise((done) => setTimeout(done, 20))
}

// Each wait is for what the engine tells or the app reads, never for a length of time: a falling asleep and a waking
// take as long as the computer makes them. The bound of the test ends it only where one of them never comes.
test('[52-11] an app with sleepAfter closes its test room when it falls asleep, and makes it anew when it wakes, by a call and by its due moment', {
  timeout: 300_000,
}, async (t) => {
  const { clock, advance } = testClock()
  const { app, counted, engine } = await apart(t, { open: { sleepAfter: '10 minutes' }, clock })
  const { heard, told } = toldOf(engine)
  const marked = new Promise<void>((done) =>
    engine.on('step.done', ({ step }) => {
      if (step === 'mark') done()
    }),
  )
  await app.call('oneWrite', { what: 'before' }, { as: nobody })
  assert.deepEqual([counted.made, counted.closed], [1, 0])
  advance(11 * 60_000)
  await told(1)
  assert.equal(counted.closed, 1, 'the room was closed as the app fell asleep')
  assert.equal(await app.call('oneRead', {}, { as: nobody }), 1, 'a call wakes the app')
  assert.equal(counted.made, 2, 'and its room was made anew')
  // A run that waits an hour is what is due of it: its due moment wakes it, with a room made anew.
  const started = await app.start('napping', {}, { as: system })
  const run = 'run' in started ? started.run : ''
  await until(() => app.runs.read(run)?.state === 'waiting')
  advance(11 * 60_000)
  // The moment it is due is set on its clock as it falls asleep.
  await told(3)
  assert.equal(counted.closed, 2, 'it fell asleep again')
  advance(60 * 60_000)
  await told(4)
  assert.deepEqual(
    [heard, counted.made],
    [['asleep', 'woke', 'asleep', 'woke'], 3],
    'its due moment woke it, with its room made anew',
  )
  await marked
  assert.equal(await app.call('oneRead', {}, { as: nobody }), 2, 'the run that woke it went on in the new room')
})
