import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Bench } from './bench.ts'
import { bench, openStore } from './bench.ts'

const second = 1000
const minute = 60 * second
const hour = 60 * minute

const orders = {
  name: 'orders',
  columns: { name: { kind: 'text' as const } },
  indexes: [],
  unique: [],
  search: [],
}

/** Tells the runner of a change of a row of the orders, in a write of its own. */
function changed(b: Bench, id: string, name: string): void {
  b.store.write((tx) => b.runner.fired(tx, { table: 'orders', kind: 'changed', row: { id, name } }))
}

/** The rows of `_t_runs` of a flow, read as they stand, each with its state. */
const rowsOf = (b: Bench, flow: string) => b.runner.find({ flow })

test('[46-3] `debounce` on a table trigger with no key makes one run for each row, after the last of ten quick changes, with the last change', async (t) => {
  const handed: unknown[] = []
  const b = bench(
    t,
    {
      noted: {
        record: { on: [{ table: 'orders', when: 'changed' }], pace: { debounce: 30 * second } },
        run: async ({ event, step }) => {
          handed.push(event)
          return step('note', () => Object(Object(event).row).name)
        },
      },
    },
    { store: openStore(':memory:', [orders]) },
  )
  for (let n = 1; n <= 10; n += 1) {
    changed(b, 'r1', `one ${n}`)
    b.clock.advance(second)
  }
  changed(b, 'r2', 'two')
  await b.settle()
  // Each waiting start is one row for each key, written in the write that started it, and moved on by the next.
  assert.deepEqual(
    rowsOf(b, 'noted').map((run) => [run.key, run.state, run.steps.length]),
    [
      ['r2', 'queued', 0],
      ['r1', 'queued', 0],
    ],
  )
  b.clock.advance(28 * second)
  await b.settle()
  assert.deepEqual(handed, [], 'no start of a row has been quiet for 30 seconds yet')
  b.clock.advance(2 * second)
  await b.settle()
  const [two, one] = rowsOf(b, 'noted')
  assert.equal(await b.runner.wait(one.id), 'one 10', 'the run is handed the last change of the row')
  b.clock.advance(30 * second)
  assert.equal(await b.runner.wait(two.id), 'two')
  assert.equal(rowsOf(b, 'noted').length, 2, 'one run for each row')
})

test('[46-3] `perMinute` lets ten runs start a minute, and the rest wait their turn in their order', async (t) => {
  const b = bench(t, {
    paced: {
      record: { input: { n: { kind: 'number' } }, pace: { perMinute: 10 } },
      run: async ({ input, step }) => step('n', () => Object(input).n),
    },
  })
  const runs = Array.from({ length: 25 }, (_, n) => b.start('paced', { n }))
  await b.settle()
  const ended = (): number[] =>
    runs.flatMap((run, n) => (b.runner.read(run)?.state === 'done' ? [n] : [])).sort((a, c) => a - c)
  assert.deepEqual(
    ended(),
    Array.from({ length: 10 }, (_, n) => n),
    'the first ten start at once',
  )
  assert.ok(
    runs.slice(10).every((run) => b.runner.read(run)?.state === 'queued'),
    'the rest wait as queued',
  )
  b.clock.advance(minute)
  await b.settle()
  assert.deepEqual(
    ended(),
    Array.from({ length: 20 }, (_, n) => n),
    'ten more a minute later, in their order',
  )
  b.clock.advance(minute)
  await b.settle()
  assert.equal(ended().length, 25)
})

test('[46-3] `drop` lets one run start an hour, and drops each other start with a line of the log and a count', async (t) => {
  const dropped: unknown[] = []
  const b = bench(
    t,
    {
      once: {
        record: { pace: { drop: { max: 1, per: hour } } },
        run: async ({ step }) => step('work', () => 'done'),
      },
    },
    { env: { dropped: (what) => void dropped.push(what) } },
  )
  const first = b.start('once')
  b.start('once')
  b.start('once')
  await b.settle()
  assert.equal(await b.runner.wait(first), 'done')
  assert.equal(rowsOf(b, 'once').length, 1, 'a start that is dropped leaves no run')
  assert.deepEqual(dropped, [{ flow: 'once' }, { flow: 'once' }], 'each drop is told')
  b.clock.advance(hour)
  const later = b.start('once')
  assert.equal(await b.runner.wait(later), 'done', 'an hour later a start runs again')
})

test('[46-3] `batch` gathers starts and hands one run a list of up to `max`, or what came within `wait`', async (t) => {
  const b = bench(t, {
    gathered: {
      record: { input: { n: { kind: 'number' } }, pace: { batch: { max: 3, wait: 10 * second } } },
      run: async ({ events, step }) => step('count', () => (events ?? []).map((one) => Object(one).input.n)),
    },
  })
  for (let n = 1; n <= 7; n += 1) b.start('gathered', { n })
  await b.settle()
  const answers = async (): Promise<unknown[]> => {
    const done = rowsOf(b, 'gathered').filter((run) => run.state === 'done')
    return Promise.all(done.map((run) => b.runner.wait(run.id)))
  }
  assert.deepEqual(
    (await answers()).sort(),
    [
      [1, 2, 3],
      [4, 5, 6],
    ],
    'a run starts with each three starts',
  )
  assert.equal(rowsOf(b, 'gathered').length, 3, 'the seventh start waits in one row')
  b.clock.advance(10 * second)
  await b.settle()
  assert.deepEqual(
    (await answers()).sort(),
    [[1, 2, 3], [4, 5, 6], [7]],
    'the first start of a batch waited ten seconds',
  )
})

test('[46-3] `order` and `turns` order the starts that wait their turn: the higher first, and among equals each key in turn', async (t) => {
  const order: string[] = []
  let open: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  const b = bench(
    t,
    {
      ranked: {
        record: {
          input: { customer: { kind: 'text' }, rank: { kind: 'number' }, name: { kind: 'text' } },
          key: { export: 'ranked_key' },
          pace: { perMinute: 1, order: { export: 'ranked_pace_order' }, turns: 'key' },
        },
        run: async ({ input, step }) => {
          const { name } = Object(input)
          if (name === 'holder') await step('hold', () => gate)
          else await step('go', () => void order.push(name))
          return name
        },
      },
    },
    {
      env: {
        arrow: (_version, _flow, which) =>
          which === 'key'
            ? (o) => Object(Object(o).input).customer
            : which === 'pace.order'
              ? (o) => Object(Object(o).input).rank
              : undefined,
      },
    },
  )
  const holder = b.start('ranked', { customer: 'c0', rank: 0, name: 'holder' })
  await b.untilStep(holder, 'hold', 'started')
  // c1 brings a backlog first; c2 comes after. Of equal rank, the keys take turns.
  for (const [customer, rank, name] of [
    ['c1', 1, 'c1 first'],
    ['c1', 1, 'c1 second'],
    ['c1', 1, 'c1 third'],
    ['c2', 1, 'c2 first'],
    ['c1', 9, 'c1 urgent'],
  ] as const)
    b.start('ranked', { customer, rank, name })
  await b.settle()
  open()
  // The starts of a key past one a minute wait by perMinute, and go a minute apart, the higher first.
  for (let n = 0; n < 3; n++) {
    b.clock.advance(minute)
    await b.settle()
  }
  for (const run of rowsOf(b, 'ranked')) await b.until(run.id, 'done')
  assert.deepEqual(order, ['c1 first', 'c2 first', 'c1 urgent', 'c1 second', 'c1 third'])
})
