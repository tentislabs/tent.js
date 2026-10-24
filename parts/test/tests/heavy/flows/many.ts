import { change, flow, list, number, object, table, text } from 'tentjs'
import { BroadcastChannel } from 'node:worker_threads'

/**
 * Tells the test where the work of an entry stands, over a channel that every thread of the program shares, so
 * that the test hears it in whatever room and on whatever worker the code runs. Answers what the test answers: how
 * long the work takes, and whether it fails.
 */
function told(n: number, at: 'begin' | 'end'): Promise<{ ms: number; fails: boolean }> {
  const channel = new BroadcastChannel('tentjs.test.many')
  // Work that nobody answers any more, of an app that was closed, holds the program up no longer.
  channel.unref()
  const id = `${n} ${at} ${Math.random()}`
  return new Promise((done) => {
    channel.onmessage = (event: unknown) => {
      const answer = Object(Reflect.get(Object(event), 'data'))
      if (answer.id !== id || 'told' in answer) return
      channel.close()
      done({ ms: Number(Object(answer.value).ms ?? 0), fails: Object(answer.value).fails === true })
    }
    channel.postMessage({ id, told: { n, at } })
  })
}

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** The work of one entry: counted by the test, side by side with the others, and failed where the test says so. */
async function work(n: number): Promise<number> {
  const { ms } = await told(n, 'begin')
  let fails = false
  try {
    await pause(ms)
  } finally {
    fails = (await told(n, 'end')).fails
  }
  if (fails) throw new Error(`the entry ${n} fails`)
  return n
}

const open = 'signedIn' as const

export const items = table('items', { columns: { n: number(), state: text() }, access: { read: open } })

export const addItems = change('addItems', {
  access: open,
  input: { count: number() },
  output: number(),
  run: ({ input, db }) => {
    for (let n = 0; n < input.count; n++) db.items.add({ n, state: 'new' })
    return input.count
  },
})

export const markItem = change('markItem', {
  access: open,
  input: { n: number() },
  output: number(),
  run: ({ input, db }) => {
    const row = db.items.where({ n: input.n }).first()
    if (row) db.items.change(row.id, { state: 'done' })
    return 1
  },
})

export const manyOne = flow('manyOne', {
  input: { n: number() },
  run: async ({ input, step }) => step('work', () => work(input.n), { tries: 1 }),
})

// Its work is tried once: an entry that fails ends its run failed at once.
export const manyMarks = flow('manyMarks', {
  input: { n: number() },
  run: async ({ input, step }) => {
    const n = await step('work', () => work(input.n), { tries: 1 })
    await step('mark', () => markItem({ n }))
    return n
  },
})

export const manyChunk = flow('manyChunk', {
  input: { entries: list(object({ n: number() })) },
  run: async ({ input, step }) => step('work', async () => (await Promise.all(input.entries.map((one) => work(one.n)))).length),
})

export const manyOnGpu = flow('manyOnGpu', {
  input: { n: number() },
  run: async ({ input, step }) => step('work', () => work(input.n), { worker: 'gpu' }),
})

/** The options of the step, written as text by the test. */
const optionsOf = (written: string): { chunk?: number; atOnce?: number; mayFail?: number | string } =>
  JSON.parse(written || '{}')

export const manyOfList = flow('manyOfList', {
  input: { count: number(), same: number(), o: text() },
  run: async ({ input, step }) => {
    const entries = Array.from({ length: input.count }, (_, i) => ({ n: input.same > 0 ? i % input.same : i }))
    return step.many('each', entries, manyOne, optionsOf(input.o))
  },
})

export const manyOfChunks = flow('manyOfChunks', {
  input: { count: number(), o: text() },
  run: async ({ input, step }) => {
    // The entry at 7 does not fit the input of the flow: its chunk goes on without it.
    const entries = Array.from({ length: input.count }, (_, i) => (i === 7 ? { n: 'seven' } : { n: i }))
    return step.many('each', entries, manyChunk, optionsOf(input.o))
  },
})

export const manyOfItems = flow('manyOfItems', {
  input: { o: text() },
  run: async ({ input, step }) =>
    step.many('each', items.where({ state: 'new' }).pick(['n']), manyMarks, optionsOf(input.o)),
})

export const manyOfFirst = flow('manyOfFirst', {
  input: { limit: number() },
  run: async ({ input, step }) =>
    step.many('each', items.newest('n').limit(input.limit).pick(['n']), manyOne),
})

export const allOnGpu = flow('allOnGpu', {
  input: { count: number() },
  run: async ({ input, step }) =>
    (
      await step.all(
        Array.from({ length: input.count }, (_, i) => i),
        (n) => step(`entry ${n}`, () => work(n), { worker: 'gpu', tries: { max: 2, wait: '1 second' } }),
      )
    ).length,
})
