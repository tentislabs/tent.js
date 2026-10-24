import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { heavyWith, joined, heavyMoment, system, untilAsync } from './heavyApps.ts'
import { listened } from './probe.ts'
import { notDropped } from './started.ts'

/** What the work of the entries did, as the test keeps what the project tells it. */
interface Seen {
  ran: Map<number, number>
  now: number
  most: number
  fail: Set<number>
  once: Set<number>
  order: number[]
  ms: number
}

// What stops the test hearing the work, where it heard it before.
let heard = (): void => undefined

/** What the work of the entries did, made anew for each test: the test hears where the work of each entry stands. */
function seenAnew(t: TestContext, ms: number): Seen {
  const made: Seen = { ran: new Map(), now: 0, most: 0, fail: new Set(), once: new Set(), order: [], ms }
  heard()
  heard = listened(t, 'tentjs.test.many', (told) => {
    const n = Number(Reflect.get(Object(told), 'n'))
    if (Reflect.get(Object(told), 'at') === 'end') {
      made.now -= 1
      return { fails: made.fail.has(n) || made.once.delete(n) }
    }
    made.ran.set(n, (made.ran.get(n) ?? 0) + 1)
    made.order.push(n)
    made.now += 1
    made.most = Math.max(made.most, made.now)
    return { ms: made.ms }
  })
  return made
}

/** Waits for a run to end, moving the clock on by a minute now and then, so that waits between tries pass. */
async function ended(app: TestApp, run: string, by = '1 minute', tries = 4000): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const state = app.runs.read(run)?.state
    if (state === 'done' || state === 'failed' || state === 'stopped') return state
    if (i % 40 === 39) app.clock.advance(by)
    await heavyMoment(5)
  }
  assert.fail(`the run ${run} never ended`)
}

/** The runs of a `step.many` of a run, by the flow of its entries. */
const runsOf = async (app: TestApp, top: string, flow: string) => {
  const found = await app.runs.find({ top, flow })
  return found.filter((one) => one.parent === top)
}

test('[51-7] the 100 entries of a step.all are carried out side by side by two workers that each take four at once, eight at a time, and one that fails is given again alone', async (t) => {
  const app = await heavyWith(t)
  const seen = seenAnew(t, 60)
  seen.once.add(13)
  await joined(t, app, ['gpu'], 4)
  await joined(t, app, ['gpu'], 4)
  const { run } = notDropped(await app.start('allOnGpu', { count: 100 }, system))
  assert.equal(await ended(app, run, '2 seconds'), 'done')
  assert.equal(await app.runs.wait(run), 100)
  assert.equal(seen.most, 8, 'eight at a time')
  assert.equal(seen.ran.get(13), 2, 'the entry that failed was given again')
  assert.deepEqual(
    [...seen.ran].filter(([n, times]) => n !== 13 && times !== 1),
    [],
    'every other entry was carried out once',
  )
})

/** A `step.many` over a list: each entry's run is added once, also when the writer is killed while the runs are added. */
async function overList(t: TestContext, count: number): Promise<void> {
  const app = await heavyWith(t, '', '  limits: { workPage: 10 },\n')
  seenAnew(t, 20)
  const { run } = notDropped(
    await app.start('manyOfList', { count, same: 7, o: JSON.stringify({ atOnce: 50 }) }, system),
  )
  await untilAsync(
    'the first runs were added',
    async () => (await app.runs.find({ top: run, flow: 'manyOne', newest: 1 })).length > 0,
  )
  await app.kill()
  await app.restart()
  const seen = seenAnew(t, 20)
  assert.equal(await ended(app, run), 'done')
  assert.deepEqual(await app.runs.wait(run), { entries: count, done: count, failed: 0 })
  const runs = await runsOf(app, run, 'manyOne')
  assert.equal(runs.length, count, 'a run for each entry, though entries hold the same values')
  assert.equal(new Set(runs.map((one) => one.id)).size, count)
  assert.equal(app.runs.read(run)?.steps.length, 1, 'the run that started them holds one step')
  assert.ok(
    seen.most <= 50 && seen.most > 10,
    `with atOnce 50 more than the 10 of together work at a time: ${seen.most}`,
  )
}

test('[51-7] a step.many over a list: each entry has one run, also where the writer is killed while the runs are added and where entries hold the same values; the run that started them holds one step; atOnce holds in place of together', async (t) => {
  await overList(t, 400)
})

test('[51-7] [night] a step.many over 10,000 entries: each entry has one run, also where the writer is killed while the runs are added and where entries hold the same values; the run that started them holds one step; with atOnce: 50 fifty work at a time on a flow whose together is 10', async (t) => {
  await overList(t, 10_000)
})

test('[51-7] a task of an entry of a step.many carries its own run alone', async (t) => {
  const app = await heavyWith(t)
  seenAnew(t, 5)
  const worker = await joined(t, app, ['gpu'])
  const { run } = notDropped(await app.start('manyOfList', { count: 3, same: 0, o: '{}' }, system))
  // The work of each entry goes to the worker as a run of its own, under its own run's id.
  const out = new Set<string>()
  await untilAsync('the entries ended', () => {
    for (const one of worker.at().working) out.add(one.run)
    return app.runs.read(run)?.state === 'done'
  })
  assert.ok(![...out].includes(run))
})

test('[51-7] a plan with no order is read in the order of its ids, and one with an order and a limit names the rows it would answer', async (t) => {
  const app = await heavyWith(t)
  const seen = seenAnew(t, 1)
  await app.call('addItems', { count: 30 }, system)
  const { run } = notDropped(await app.start('manyOfItems', { o: JSON.stringify({ atOnce: 1 }) }, system))
  assert.equal(await ended(app, run), 'done')
  assert.deepEqual(
    seen.order,
    Array.from({ length: 30 }, (_, i) => i),
  )
  const ordered = seenAnew(t, 1)
  const { run: first } = notDropped(await app.start('manyOfFirst', { limit: 5 }, system))
  assert.equal(await ended(app, first), 'done')
  assert.deepEqual(
    [...ordered.ran.keys()].sort((a, b) => a - b),
    [25, 26, 27, 28, 29],
  )
})

test('[51-7] with chunk: 50 there are 200 runs, and an entry that does not fit the input of the flow counts as failed while its chunk goes on without it', async (t) => {
  const app = await heavyWith(t)
  const seen = seenAnew(t, 0)
  const { run } = notDropped(
    await app.start('manyOfChunks', { count: 10_000, o: JSON.stringify({ chunk: 50, mayFail: 1 }) }, system),
  )
  assert.equal(await ended(app, run), 'done')
  assert.deepEqual(await app.runs.wait(run), { entries: 10_000, done: 9_999, failed: 1 })
  assert.equal((await runsOf(app, run, 'manyChunk')).length, 200)
  assert.equal(seen.ran.size, 9_999)
  assert.equal(seen.ran.has(7), false)
})

/** A `step.many` whose entries fail past `mayFail`: the step fails with the error of the run that passed it, and the rest is stopped. */
async function pastShare(t: TestContext, count: number): Promise<void> {
  const app = await heavyWith(t)
  const seen = seenAnew(t, 10)
  const share = count / 100
  for (let n = 0; n < count; n += 50) seen.fail.add(n)
  const { run } = notDropped(
    await app.start('manyOfList', { count, same: 0, o: JSON.stringify({ mayFail: '1%', atOnce: 20 }) }, system),
  )
  // The try of the step fails once the share was passed: its step keeps the error, and waits for its next try.
  await untilAsync('the try of the step failed', () => app.runs.read(run)?.steps[0]?.error !== undefined, 6000)
  await heavyMoment(200)
  const runs = await runsOf(app, run, 'manyOne')
  const failed = runs.filter((one) => one.state === 'failed').length
  assert.ok(failed > share, `more entries failed than the share allows: ${failed}`)
  assert.ok(failed <= share + 20, `the step failed when the share was passed: ${failed}`)
  assert.match(String(app.runs.read(run)?.steps[0]?.error?.message), /the entry \d+ fails/)
  assert.ok(
    runs.some((one) => one.state === 'stopped'),
    'the rest was stopped',
  )
}

test("[51-7] with mayFail: '1%' the step fails once more entries failed than one in a hundred, and the rest is stopped", async (t) => {
  await pastShare(t, 2_000)
})

test("[51-7] [night] with mayFail: '1%' over 10,000 entries the step fails when the 101st entry failed, and the rest is stopped", async (t) => {
  await pastShare(t, 10_000)
})

test('[51-7] a second try of the step carries out only the entries whose run did not end well, though the plan names them no more', async (t) => {
  const app = await heavyWith(t)
  const seen = seenAnew(t, 5)
  seen.fail.add(3)
  seen.fail.add(8)
  await app.call('addItems', { count: 20 }, system)
  const { run } = notDropped(await app.start('manyOfItems', { o: JSON.stringify({ atOnce: 2 }) }, system))
  // The entry at 3 or 8 failed, more than mayFail allows: the try of the step fails, and the rest is stopped.
  await untilAsync('the first try failed', async () =>
    (await runsOf(app, run, 'manyMarks')).some((one) => one.state === 'failed'),
  )
  await heavyMoment(200)
  const marked = await app.read({ from: 'items', where: { col: 'state', is: 'done' }, pick: ['n'] }, { as: 'system' })
  const well = (Array.isArray(marked) ? marked : []).map((row) => Number(Reflect.get(Object(row), 'n')))
  assert.ok(well.length > 0 && well.length < 20)
  seen.fail.clear()
  assert.equal(await ended(app, run), 'done')
  assert.deepEqual(await app.runs.wait(run), { entries: 20, done: 20, failed: 0 })
  for (const n of well) assert.equal(seen.ran.get(n), 1, `the entry ${n} ended well and was not carried out again`)
  // The entry at 3 failed first, and the try ended there: the one at 8 may not have begun.
  assert.equal(seen.ran.get(3), 2)
  assert.ok((seen.ran.get(8) ?? 0) >= 1)
})
