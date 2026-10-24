import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp, TestWorker } from '../index.ts'
import { beats, heavyWith, joined, heavyMoment, system, untilAsync, workingOn } from './heavyApps.ts'
import { notDropped } from './started.ts'

/** Starts runs of `onKind` on a kind, one for each number, and answers their ids. */
async function started(app: TestApp, kind: string, numbers: number[]): Promise<string[]> {
  const runs: string[] = []
  for (const n of numbers) runs.push(notDropped(await app.start('onKind', { n, kind }, system)).run)
  return runs
}

/**
 * Kills the program of a worker and starts it again at once, each time it works on the run that ends it, until that
 * run has ended. Answers how often it did so, and whether that run was ever worked on beside another.
 */
async function endsItsWorker(
  app: TestApp,
  worker: TestWorker,
  killer: string,
): Promise<{ kills: number; beside: boolean }> {
  let kills = 0
  let beside = false
  for (let i = 0; i < 4000; i++) {
    const state = app.runs.read(killer)?.state
    if (state === 'failed' || state === 'done') return { kills, beside }
    const on = workingOn(worker)
    if (on.includes(killer)) {
      if (kills > 0 && on.length > 1) beside = true
      kills += 1
      await worker.kill()
      await worker.restart()
    }
    await heavyMoment(5)
  }
  assert.fail('the run that ends its worker never ended')
}

test('[51-3] work that ends every worker it is given fails its run with T5107 after tries, with a worker still joined', async (t) => {
  const app = await heavyWith(t)
  const keeper = await joined(t, app, ['slow'])
  const worker = await joined(t, app, ['gpu'])
  const [killer] = await started(app, 'gpu', [3])
  const { kills } = await endsItsWorker(app, worker, killer)
  assert.equal(app.runs.read(killer)?.error?.code, 'T5107')
  assert.equal(kills, 4, 'each try that ended its worker alone counted against tries, of which there are 4')
  assert.ok(app.workers().some((one) => Reflect.get(Object(one), 'id') === keeper.at().id))
})

test('[51-3] a task that ends its worker while nineteen others are beside it: each of them is saved once, and the one fails alone after tries, handed out alone each time', async (t) => {
  const app = await heavyWith(t)
  const worker = await joined(t, app, ['gpu'], 20)
  const numbers = Array.from({ length: 20 }, (_, i) => i + 1)
  const runs = await started(app, 'gpu', numbers)
  const killer = runs[12]
  await untilAsync('the twenty are out', () => workingOn(worker).length === 20)
  const { beside } = await endsItsWorker(app, worker, killer)
  assert.equal(beside, false, 'the task that ends its worker was handed out beside another after it was marked alone')
  assert.equal(app.runs.read(killer)?.error?.code, 'T5107')
  for (const [i, run] of runs.entries())
    if (run !== killer) assert.equal(await app.runs.wait(run), numbers[i] * numbers[i], `run ${i + 1}`)
})

test('[51-3] on a kind that states alone false a task that was lost beside others is handed out as any other', async (t) => {
  const app = await heavyWith(t, "    shared: { about: 'Never alone', alone: false },\n")
  const worker = await joined(t, app, ['shared'], 2)
  const [one, two] = await started(app, 'shared', [2, 3])
  await untilAsync('both are out', () => workingOn(worker).length === 2)
  await worker.kill()
  await worker.restart()
  await untilAsync('both are out together again', () => workingOn(worker).length === 2, 2000)
  assert.deepEqual([await app.runs.wait(one), await app.runs.wait(two)], [4, 9])
})

test('[51-3] twenty tasks lost with one worker of three keep one worker between them, and the two others go on with what waits; with alone 2, two are kept', async (t: TestContext) => {
  for (const [kind, kept] of [
    ['gpu', 1],
    ['pair', 2],
  ] as const) {
    const app = await heavyWith(t, "    pair: { about: 'Two kept for work alone', alone: 2 },\n")
    const lost = await joined(t, app, [kind], 20)
    const runs = await started(
      app,
      kind,
      Array.from({ length: 20 }, (_, i) => i + 1),
    )
    await untilAsync('the twenty are out to one worker', () => workingOn(lost).length === 20)
    // The worker is killed before any of them ends, and two others join.
    await lost.kill()
    const second = await joined(t, app, [kind], 2)
    const third = await joined(t, app, [kind], 2)
    await beats(app, 8)
    const fresh = await started(app, kind, [100])
    const holding = new Set<number>()
    let freshFirst = false
    await untilAsync(
      'the twenty were carried out again',
      async () => {
        const alone = [second, third].map((one) => workingOn(one).filter((run) => runs.includes(run)).length)
        holding.add(alone.filter((count) => count > 0).length)
        assert.ok(
          alone.every((count) => count <= 1),
          'a task that goes alone was handed out beside another',
        )
        if (app.runs.read(fresh[0])?.state === 'done' && runs.some((run) => app.runs.read(run)?.state !== 'done'))
          freshFirst = true
        return runs.every((run) => app.runs.read(run)?.state === 'done')
      },
      4000,
    )
    assert.equal(Math.max(...holding), kept, `${kind}: workers kept for the tasks that go alone: ${[...holding]}`)
    if (kept === 1) assert.ok(freshFirst, 'the work that waits stood behind the twenty')
    await app.close()
  }
})

test('[51-3] a worker that fell silent is handed nothing from its second missed alive on', async (t) => {
  const app = await heavyWith(t)
  const silent = await joined(t, app, ['gpu'])
  const other = await joined(t, app, ['gpu'])
  silent.hold()
  await beats(app, 3)
  const [run] = await started(app, 'gpu', [4])
  await untilAsync('the task went to the other worker', () => workingOn(other).includes(run))
  assert.deepEqual(workingOn(silent), [])
  silent.free()
})

test('[51-3] a worker that was held still on a link that stayed open is joined again by its next alive, and is told to stop what is out to it no more', async (t) => {
  const app = await heavyWith(t)
  const first = await joined(t, app, ['gpu'])
  const [run] = await started(app, 'gpu', [5])
  await untilAsync('the task is out to the first worker', () => workingOn(first).includes(run))
  first.hold()
  const second = await joined(t, app, ['gpu'])
  await beats(app, 8)
  await untilAsync('the task went to the second worker', () => workingOn(second).includes(run))
  assert.ok(!app.workers().some((one) => Reflect.get(Object(one), 'id') === first.at().id), 'the silent one is joined')
  first.free()
  await beats(app, 2)
  await untilAsync('the first worker is joined again', () =>
    app.workers().some((one) => Reflect.get(Object(one), 'id') === first.at().id),
  )
  await untilAsync('the first worker stopped the task', () => workingOn(first).length === 0)
  assert.equal(await app.runs.wait(run), 25)
})
