import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { Link } from '../copy/link.ts'
import { linkPair, tell } from '../copy/link.ts'
import { addUser, engineOf, logRows, system, testClock } from './apps.ts'
import type { RawWorker } from './workLink.ts'
import { here, joiningKeys, rawWorker, readyWorker, writerOf } from './workLink.ts'
import { notDropped } from './started.ts'

const moment = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A project whose frames hold no more than a small value, so that a few rows travel as a file. */
const small = (description: Description): void => {
  description.project.limits = { ...Object(description.project.limits), inFrame: 200 }
}

/** A worker by hand under a machine id of its own, joined and ready for every version. */
async function readyAs(app: Parameters<typeof rawWorker>[0], key: string, id: string): Promise<RawWorker> {
  const worker = rawWorker(app, key)
  worker.send(here({ id, kinds: ['gpu'] }))
  await worker.next('go')
  const versions = await worker.next('versions')
  for (const one of Array.isArray(versions.list) ? versions.list : [])
    worker.send({ t: 'ready', version: Object(one).version })
  return worker
}

/** Asks the writer a call under a task, and answers what it was answered. */
async function asked(worker: RawWorker, id: string, task: string, call: object): Promise<Record<string, unknown>> {
  worker.send({ t: 'call', id, task, ...call })
  for (;;) {
    const answer = await worker.next('answer')
    if (answer.id === id) return answer
  }
}

test('[51-11.8] a worker that asks for a file that no task of its own names, with the task of another worker, or by an id that the caller of its task may not download, is answered not found', async (t) => {
  const { app, origin } = await writerOf(t, { change: small })
  const ada = await addUser(app, 'Ada')
  const bo = await addUser(app, 'Bo')
  for (let i = 0; i < 6; i++) await app.call('addMark', { what: `mark ${i} of a list that is long` }, { as: system })
  const own = String(await app.call('keepNote', { text: 'of Ada alone' }, { as: ada }))
  const boOwn = String(await app.call('keepNote', { text: 'of Bo' }, { as: bo }))
  const worker = await readyWorker(app, joiningKeys.free)
  const other = await readyAs(app, joiningKeys.single, '01m4x5y72ke6aay7szexb9d1dy')
  await app.start('withRows', undefined, { as: system })
  const work = Object((await worker.next('work')).task)
  const fingerprint = String(Object(Object(work.rows).marks).file)
  const asks = (path: string, key: string) =>
    fetch(`${origin}/_t/work/file/${path}`, { headers: { authorization: `Bearer ${key}` } })
  assert.equal((await asks(`${fingerprint}?task=${work.id}`, joiningKeys.free)).status, 200)
  assert.equal((await asks(`${'a'.repeat(64)}?task=${work.id}`, joiningKeys.free)).status, 404, 'a file no task names')
  assert.equal(
    (await asks(`${fingerprint}?task=${work.id}`, joiningKeys.single)).status,
    404,
    'the task of another worker',
  )
  other.close()
  worker.send({ t: 'started', task: work.id })
  worker.send({ t: 'done', task: work.id, result: 6, cpuMs: 1 })
  await worker.next('saved')
  // A run that Bo starts: its task may reach Bo's own file by its id, and not Ada's.
  await app.start('asStarterOnGpu', undefined, { as: bo })
  const mine = Object((await worker.next('work')).task)
  assert.equal((await asks(`${boOwn}?task=${mine.id}`, joiningKeys.free)).status, 200)
  assert.equal(
    (await asks(`${own}?task=${mine.id}`, joiningKeys.free)).status,
    404,
    'a file its caller may not download',
  )
  worker.close()
})

test('[51-11.9] a worker that says ready and loaded for what it does not hold is handed tasks that then fail by the rule of every try, and app.workers shows how many in a row', async (t) => {
  const { app } = await writerOf(t)
  const worker = rawWorker(app, joiningKeys.free)
  worker.send(here({ kinds: ['gpu'] }))
  await worker.next('go')
  const versions = await worker.next('versions')
  for (const one of Array.isArray(versions.list) ? versions.list : [])
    worker.send({ t: 'ready', version: Object(one).version })
  worker.send({ t: 'loaded', names: ['nothing', 'at all'] })
  const { run } = notDropped(await app.start('onGpu', { n: 3 }, { as: system }))
  const work = Object((await worker.next('work')).task)
  worker.send({ t: 'started', task: work.id })
  worker.send({
    t: 'failed',
    task: work.id,
    error: { code: 'T0011', message: 'This worker does not hold the version.' },
    cpuMs: 0,
  })
  await worker.next('saved')
  assert.deepEqual(Object(app.workers()[0]).inARow, { failed: 1, lost: 0 })
  assert.deepEqual(Object(app.workers()[0]).loaded, ['nothing', 'at all'])
  assert.notEqual(app.runs.read(run)?.state, 'done')
  worker.close()
})

/** A machine reached at a worker's from by no network, that the test drives: each dial is one link, and what it was asked. */
function machineOf() {
  const dials: Link[] = []
  const asked: string[] = []
  return {
    dials,
    asked,
    reach: (address: string) => {
      asked.push(address)
      return {
        request: async () => new Response('', { status: 404 }),
        link: () => {
          const [writerEnd, workerEnd] = linkPair()
          dials.push(writerEnd)
          return workerEnd
        },
      }
    },
  }
}

/** The messages that one end of a link was sent, and whether it was closed. */
function heardOn(link: Link): { heard: Record<string, unknown>[]; closed: () => boolean } {
  const heard: Record<string, unknown>[] = []
  let over = false
  link.each(
    (frame) => {
      if (typeof frame === 'string') heard.push(Object(JSON.parse(frame)))
    },
    () => {
      over = true
    },
  )
  return { heard, closed: () => over }
}

test('[51-11.11] a machine at the worker from that answers no with an address of its own is not followed, and a writer of an older epoch that says go is left', async (t) => {
  const { clock, advance } = testClock()
  const engine = engineOf(t, { makers: { clock: () => clock } })
  const folder = mkdtempSync(join(tmpdir(), 'tent-worker-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  const machine = machineOf()
  const from = 'http://writer.test'
  const worker = await engine.work({
    from,
    key: joiningKeys.free,
    kinds: ['gpu'],
    folder,
    reach: machine.reach,
    insecure: true,
  })
  t.after(() => worker.close({ now: true }))
  for (let i = 0; i < 50 && !machine.dials.length; i++) await moment(10)
  const first = machine.dials[0]
  assert.ok(first)
  const one = heardOn(first)
  await moment()
  assert.equal(one.heard[0]?.t, 'here')
  tell(first, { t: 'no', code: 'T0030', address: 'http://elsewhere.test' })
  for (let i = 0; i < 40 && machine.dials.length < 2; i++) {
    advance(1000)
    await moment(10)
  }
  assert.ok(machine.dials.length >= 2, 'the worker dialled again')
  assert.deepEqual([...new Set(machine.asked)], [from], 'it dialled no address that a no named')
  // A writer of epoch 5 joins it, and a later one of epoch 3 says go: that one is left.
  const second = machine.dials[1]
  if (!second) throw new Error('no second dial')
  heardOn(second)
  tell(second, { t: 'go', epoch: '5.1', mode: 'test', beat: 1000, behind: 5000, dial: 30_000, still: [] })
  await moment()
  second.close()
  for (let i = 0; i < 40 && machine.dials.length < 3; i++) {
    advance(1000)
    await moment(10)
  }
  const third = machine.dials[2]
  if (!third) throw new Error('no third dial')
  const old = heardOn(third)
  tell(third, { t: 'go', epoch: '3.1', mode: 'test', beat: 1000, behind: 5000, dial: 30_000, still: [] })
  for (let i = 0; i < 20 && !old.closed(); i++) await moment(10)
  assert.equal(old.closed(), true, 'the writer of an older epoch was left')
  assert.deepEqual([...new Set(machine.asked)], [from])
})

test('[51-11.12] on a kind that states systemWork false, a worker that asks a handle, a do that uses does not name, or a read with system under a visitor task is answered T0013', async (t) => {
  const { app } = await writerOf(t)
  const worker = await readyWorker(app, joiningKeys.free, ['locked'])
  await app.start('onLockedVisitor', { what: 'a visitor mark' }, { as: { kind: 'nobody', visitor: 'v1' } })
  const work = Object((await worker.next('work')).task)
  const task = String(work.id)
  worker.send({ t: 'started', task })
  for (const [id, call] of [
    ['h1', { what: 'handle', handle: 'sessions', member: 'start', args: [] }],
    ['h2', { what: 'handle', handle: 'roles', member: 'add', args: [] }],
    ['d1', { what: 'do', name: 'addUser', input: { name: 'Eve', roles: ['admin'] } }],
    ['r1', { what: 'read', plan: { from: 'users' }, system: true }],
  ] as const) {
    const answer = await asked(worker, id, task, call)
    assert.equal(Object(answer.error).code, 'T0013', `${id}: ${JSON.stringify(answer)}`)
  }
  worker.close()
})

test('[51-11.13] a worker that sends progress and log without end is refused with T0005 past workPerMinute, for that worker alone', async (t) => {
  const { app } = await writerOf(t, {
    change: (description) => {
      description.project.limits = { ...Object(description.project.limits), workPerMinute: 5 }
    },
  })
  const worker = await readyWorker(app, joiningKeys.free)
  const calm = await readyAs(app, joiningKeys.single, '01m4x5y72ke6aay7szexb9d1dy')
  await app.start('longOnGpu', { text: 'abc' }, { as: system })
  const work = Object((await worker.next('work')).task)
  const task = String(work.id)
  worker.send({ t: 'started', task })
  for (let n = 1; n <= 6; n++) worker.send({ t: 'progress', task, value: n, files: [], n })
  worker.send({ t: 'log', task, lines: [{ at: 0, level: 'info', message: 'one line too many' }] })
  await moment(100)
  const refused = worker.heard.filter((one) => one.t === 'refused' && one.code === 'T0005')
  assert.ok(refused.length >= 2, JSON.stringify(worker.heard.map((one) => [one.t, one.what, one.code])))
  assert.ok(refused.some((one) => one.what === 'log'))
  assert.equal(calm.heard.filter((one) => one.code === 'T0005').length, 0, 'the other worker is refused nothing')
  worker.close()
  calm.close()
})

test('[51-11.13] the files that a worker posts past workHeld are refused with T0005, and the lines of its log are written under its task', async (t) => {
  const { app, origin, dataFolder } = await writerOf(t, {
    change: (description) => {
      description.project.limits = { ...Object(description.project.limits), workHeld: 100 }
    },
  })
  const worker = await readyWorker(app, joiningKeys.free)
  const { run } = notDropped(await app.start('longOnGpu', { text: 'abc' }, { as: system }))
  const work = Object((await worker.next('work')).task)
  const task = String(work.id)
  worker.send({ t: 'started', task })
  const post = (body: string) =>
    fetch(`${origin}/_t/work/file?task=${task}&kind=text/plain`, {
      method: 'POST',
      headers: { authorization: `Bearer ${joiningKeys.free}`, 'content-type': 'application/octet-stream' },
      body,
    })
  assert.equal((await post('x'.repeat(60))).status, 200)
  const past = await post('y'.repeat(60))
  assert.equal(Object(Object(await past.json()).error).code, 'T0005')
  worker.send({ t: 'log', task, lines: [{ at: 1, level: 'warn', message: 'a line of the work' }] })
  worker.send({ t: 'done', task, result: 3, cpuMs: 1 })
  await worker.next('saved')
  await moment(100)
  const lines = logRows(dataFolder, 'lines').filter((one) => one.message === 'a line of the work')
  assert.deepEqual(
    lines.map((one) => [one.level, one.run, one.name]),
    [['warn', run, 'longOnGpu']],
  )
  worker.close()
})

test('[51-2] the lines that work on a worker writes with log are gathered and written to the log of the writer, under the run of its task', async (t) => {
  const { app, clock, advance, dataFolder, origin } = await writerOf(t)
  const engine = engineOf(t, { makers: { clock: () => clock } })
  const folder = mkdtempSync(join(tmpdir(), 'tent-worker-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  const worker = await engine.work({
    from: origin,
    key: joiningKeys.free,
    kinds: ['gpu'],
    folder,
    reach: () => app,
    insecure: true,
  })
  t.after(() => worker.close({ now: true }))
  const { run } = notDropped(await app.start('logsOnGpu', undefined, { as: system }))
  // The worker dials, joins and is handed the work as the clock of the test moves on.
  for (let i = 0; i < 200 && app.runs.read(run)?.state !== 'done'; i++) {
    advance(500)
    await moment(20)
  }
  assert.equal(await app.runs.wait(run), 1)
  await moment(100)
  const lines = logRows(dataFolder, 'lines').filter((one) => one.message === 'a line from the worker')
  assert.deepEqual(
    lines.map((one) => [one.level, one.run, one.name, one.data]),
    [['info', run, 'logsOnGpu', '{"n":1}']],
  )
})

test('[51-4] a run that was read, whose worker asks for a plan its body does not hold or a call it does not make, is T0013', async (t) => {
  const { app } = await writerOf(t, { bodies: { bodyOnGpu: { run: [{ return: 1 }] } } })
  const worker = await readyWorker(app, joiningKeys.free)
  const call = app.call('bodyOnGpu', undefined, { as: system }).catch(() => undefined)
  const work = Object((await worker.next('work')).task)
  const task = String(work.id)
  worker.send({ t: 'started', task })
  const read = await asked(worker, 'b1', task, { what: 'read', plan: { from: 'marks' } })
  assert.equal(Object(read.error).code, 'T0013', JSON.stringify(read))
  const done = await asked(worker, 'b2', task, { what: 'do', name: 'addMark', input: { what: 'not in the body' } })
  assert.equal(Object(done.error).code, 'T0013', JSON.stringify(done))
  worker.send({ t: 'done', task, result: 1, cpuMs: 1 })
  await call
  worker.close()
})
