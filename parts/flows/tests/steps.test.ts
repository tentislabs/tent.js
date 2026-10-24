import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fail, TentError } from '../../core/index.ts'
import type { Made } from './bench.ts'
import { bench, codeOf, handClock, openStore, version, workFolder } from './bench.ts'

const second = 1000
const minute = 60 * second
const day = 86_400_000

test('[23-7] a wait of three days wakes within one minute of its time, by a test clock', async (t) => {
  let passes = 0
  const b = bench(t, {
    pause: async ({ step }) => {
      passes += 1
      const before = await step('before', () => 'a')
      await step.wait('3 days')
      return `${before}${await step('after', () => 'b')}`
    },
  })
  const began = b.clock.now()
  const run = b.start('pause')
  await b.until(run, 'waiting')
  assert.equal(passes, 1)
  assert.deepEqual(b.clock.timers(), [began + 3 * day], 'the runner holds one timer, at the moment the wait ends')
  // A minute before its time the run still waits, and nothing of it was carried out again.
  b.clock.advance(3 * day - minute)
  await b.settle()
  assert.equal(b.runner.read(run)?.state, 'waiting')
  assert.equal(passes, 1)
  b.clock.advance(minute)
  assert.equal(await b.until(run, 'done'), 'done')
  assert.equal(await b.runner.wait(run), 'ab')
  assert.equal(passes, 2, 'the run was carried out from its top once more, and went on from the wait')
  assert.deepEqual(
    b.runner.read(run)?.steps.map((step) => [step.name, step.state]),
    [
      ['before', 'done'],
      ['wait', 'done'],
      ['after', 'done'],
    ],
  )
})

test('[23-7] a machine that was off for a week wakes each run once, and a schedule that missed seven times fires once', async (t) => {
  const folder = workFolder(t)
  const clock = handClock()
  const woke: string[] = []
  const flows: Record<string, Made> = {
    sleeper: {
      run: async ({ input, step }) => {
        const { name, wait } = Object(input)
        await step.wait(String(wait))
        woke.push(String(name))
      },
    },
    daily: {
      record: { on: [{ every: 'day at 09:00' }] },
      run: async ({ event }) => {
        const at: unknown = Object(event).at
        woke.push(`daily ${at instanceof Date ? at.toISOString() : 'no moment'}`)
      },
    },
  }
  const first = bench(t, flows, { store: openStore(folder), clock })
  const runs = [
    first.start('sleeper', { name: 'one', wait: '1 day' }),
    first.start('sleeper', { name: 'two', wait: '2 days' }),
    first.start('sleeper', { name: 'three', wait: '6 days' }),
  ]
  for (const run of runs) await first.until(run, 'waiting')
  // The machine is switched off: the runner is closed, its store with it, and a week passes with no timer called.
  const closed = await first.runner.close()
  assert.equal(closed.dueAt, clock.now() + 9 * 60 * minute, 'what is due first is the schedule, at nine in the morning')
  first.store.close()
  assert.deepEqual(clock.timers(), [], 'a closed runner holds no timer')
  clock.advance(7 * day)
  assert.deepEqual(woke, [])

  const second = bench(t, flows, { store: openStore(folder), clock })
  for (const run of runs) assert.equal(await second.until(run, 'done'), 'done')
  await second.settle()
  const daily = second.runner.find({ flow: 'daily' })
  assert.equal(daily.length, 1, 'the seven times that were missed fire once')
  assert.equal(await second.until(daily[0].id, 'done'), 'done')
  assert.deepEqual([...woke].sort(), ['daily 2026-01-01T09:00:00.000Z', 'one', 'three', 'two'])
  assert.equal(second.runner.read(runs[0])?.steps.length, 1)
  // The schedule goes on from the present: its next turn is the next nine in the morning.
  assert.deepEqual(second.clock.timers(), [Date.UTC(2026, 0, 8, 9)])
})

test('[23-21] [16-2@7b] a caller that waits for a run that is stopped gets T5106', async (t) => {
  const b = bench(t, {
    long: async ({ step }) => {
      await step.wait('1 day')
      return 'never'
    },
  })
  const run = b.start('long')
  await b.until(run, 'waiting')
  const waiting = b.runner.wait(run)
  b.runner.stop(run)
  assert.equal(await codeOf(waiting), 'T5106')
  assert.equal(b.runner.read(run)?.state, 'stopped')
  assert.equal(await codeOf(b.runner.wait(run)), 'T5106', 'and so does a caller that asks after the stop')
  // A stopped run is taken up no more.
  b.clock.advance(2 * day)
  await b.settle()
  assert.equal(b.runner.read(run)?.state, 'stopped')
})

test('[23-25] a step that fails with T0002, with T3101 or with the own `fail` of the app is not tried again', async (t) => {
  const calls = { input: 0, access: 0, own: 0 }
  const b = bench(t, {
    input: async ({ step }) =>
      step('check', () => {
        calls.input += 1
        throw new TentError('T0002', 'What was sent does not fit.')
      }),
    access: async ({ step }) =>
      step('check', () => {
        calls.access += 1
        throw new TentError('T3101', 'You may not do this.')
      }),
    own: async ({ step }) =>
      step('check', () => {
        calls.own += 1
        return fail('not-draft', 'The invoice is no draft.')
      }),
  })
  for (const [flow, code] of [
    ['input', 'T0002'],
    ['access', 'T3101'],
    ['own', 'not-draft'],
  ] as const) {
    const run = b.start(flow)
    assert.equal(await b.until(run, 'failed', 'waiting'), 'failed', `${flow} fails at its first try`)
    assert.equal(await codeOf(b.runner.wait(run)), code)
    assert.equal(b.runner.read(run)?.steps[0].error?.code, code)
  }
  assert.deepEqual(calls, { input: 1, access: 1, own: 1 })
})

test('[23-25] a step is tried four times, each wait six times the one before, and one that states `tries: 5` five times', async (t) => {
  const tried = { four: 0, five: 0, passes: 0 }
  const b = bench(t, {
    four: async ({ step }) => {
      tried.passes += 1
      return step('send', () => {
        tried.four += 1
        throw new Error('the server did not answer')
      })
    },
    five: async ({ step }) =>
      step(
        'send',
        () => {
          tried.five += 1
          if (tried.five < 5) throw new Error('the server did not answer')
          return 'sent'
        },
        { tries: 5 },
      ),
  })
  const four = b.start('four')
  await b.until(four, 'waiting')
  assert.equal(tried.four, 1)
  assert.equal(b.runner.read(four)?.steps[0].state, 'waiting')
  // The waits are 5 seconds, 30 seconds and 3 minutes: just before each the step is not tried.
  for (const [wait, tries] of [
    [5 * second, 2],
    [30 * second, 3],
    [3 * minute, 4],
  ]) {
    b.clock.advance(wait - 1)
    await b.settle()
    assert.equal(tried.four, tries - 1, `one millisecond before the wait of ${wait} ms ends the step is not tried`)
    b.clock.advance(1)
    await b.until(four, tries === 4 ? 'failed' : 'waiting')
    assert.equal(tried.four, tries)
  }
  assert.equal(await codeOf(b.runner.wait(four)), 'T0009', 'an error in app code is what no caller is shown')
  assert.equal(tried.passes, 4)

  const five = b.start('five')
  for (const wait of [5 * second, 30 * second, 3 * minute, 18 * minute]) {
    await b.until(five, 'waiting')
    b.clock.advance(wait)
  }
  assert.equal(await b.runner.wait(five), 'sent')
  assert.equal(tried.five, 5)
})

test('[23-29] a step with `background: true` runs on a thread and is saved on the main one, and the entry beside it in a `step.all` is not run twice', async (t) => {
  const ran = { heavy: 0, light: 0, between: 0 }
  const b = bench(t, {
    both: async ({ step }) => {
      ran.between += 1
      const first = await step('first', () => 2)
      return step.all([
        () =>
          step(
            'heavy',
            () => {
              ran.heavy += 1
              return Number(first) * 21
            },
            { background: true },
          ),
        () =>
          step('light', () => {
            ran.light += 1
            return 'light'
          }),
      ])
    },
  })
  const run = b.start('both')
  assert.deepEqual(await b.runner.wait(run), [42, 'light'])
  assert.deepEqual(
    b.threads.map((at) => [at.run, at.step]),
    [[run, { name: 'heavy', repeat: 1 }]],
    'the engine was asked to carry the heavy step out on a thread, once',
  )
  assert.equal(ran.heavy, 1, 'the work of the heavy step ran once, where the thread carried the pass out again')
  assert.equal(ran.light, 1, 'the other entry was carried out on the main thread, and not on the thread too')
  assert.equal(ran.between, 2, 'the code between the steps ran once for the pass, and once on the thread')
  assert.deepEqual(
    b.runner.read(run)?.steps.map((step) => [step.name, step.state, step.result]),
    [
      ['first', 'done', 2],
      ['heavy', 'done', 42],
      ['light', 'done', 'light'],
    ],
    'the result of the heavy step was saved by the runner',
  )
})

test('[23-29] a called flow that failed is called anew by the second try of its step, and one that ended well is not', async (t) => {
  const ran = { good: 0, bad: 0 }
  const called: string[] = []
  const b = bench(t, {
    good: async ({ step }) =>
      step('work', () => {
        ran.good += 1
        return 'fine'
      }),
    bad: async () => {
      ran.bad += 1
      if (ran.bad === 1) throw new Error('the first run of it breaks')
      return 'mended'
    },
    caller: async ({ step }) =>
      step('both', async () => {
        // What the engine does for a flow that a step calls: it adds the run, with the call it is, and waits.
        const at = b.inside.at(-1)
        const call = (flow: string): Promise<unknown> => {
          const id = b.runner.add({
            flow,
            version,
            startedBy: { kind: 'system' },
            ...(at ? { parent: at } : {}),
            call: `${flow}\n-\n0`,
          })
          called.push(`${flow} ${id}`)
          return b.runner.wait(id)
        }
        const good = await call('good')
        return `${good} ${await call('bad')}`
      }),
  })
  const run = b.start('caller')
  await b.untilStep(run, 'both', 'waiting')
  assert.deepEqual([ran.good, ran.bad], [1, 1])
  assert.equal(await b.until(run, 'waiting'), 'waiting', 'the run waits for the second try of its step')
  b.clock.advance(5 * second)
  assert.equal(await b.runner.wait(run), 'fine mended')
  assert.deepEqual(
    [ran.good, ran.bad],
    [1, 2],
    'the run that ended well was answered again, and the failed one called anew',
  )
  const [good1, bad1, good2, bad2] = called.map((one) => one.split(' ')[1])
  assert.equal(good1, good2, 'the second try found the same run of the flow that ended well')
  assert.notEqual(bad1, bad2, 'and started a new run of the flow that failed')
  assert.ok(good1.startsWith('z') && good1.length === 26, 'the id of a called run says where it comes from')
  assert.equal(b.runner.read(bad2)?.parent, run)
  assert.deepEqual(b.runner.read(bad2)?.parentStep, { name: 'both', repeat: 1 })
  assert.equal(b.runner.read(bad2)?.top, run)
})
