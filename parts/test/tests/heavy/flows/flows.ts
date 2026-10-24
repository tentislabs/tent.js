import { action, anyone, change, flow, input, number, query, table, text } from 'tentjs'

const open = 'signedIn' as const

export const marks = table('marks', { columns: { what: text() }, access: { read: open } })

export const addMark = change('addMark', {
  access: open,
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: open, rows: marks.limit(100) })

/** Answers after a moment of real time, so that a test sees the work while it is out. */
const later = <T>(value: T): Promise<T> => new Promise((done) => setTimeout(() => done(value), 150))

export const onGpu = flow('onGpu', {
  input: { n: number() },
  run: async ({ input: given, step }) =>
    step('square', () => later(given.n * given.n), { worker: 'gpu', time: '1 minute' }),
})

// A step on gpu whose work stays out for seconds: long enough for a second worker to join while it is out, in
// whatever room the code of the workers runs.
export const onGpuLong = flow('onGpuLong', {
  input: { n: number() },
  run: async ({ input: given, step }) =>
    step('square', () => new Promise((done) => setTimeout(() => done(given.n * given.n), 3000)), {
      worker: 'gpu',
      time: '1 minute',
    }),
})

export const onOldest = flow('onOldest', {
  input: { n: number() },
  run: async ({ input: given, step }) => step('square', () => later(given.n * given.n), { worker: 'oldest' }),
})

export const onPacked = flow('onPacked', {
  input: { n: number() },
  run: async ({ input: given, step }) => step('square', () => later(given.n * given.n), { worker: 'packed' }),
})

// A step on a kind that the test states with turns for each caller, where it adds it.
export const onTurns = flow('onTurns', {
  input: { n: number() },
  run: async ({ input: given, step }) => step('square', () => later(given.n * given.n), { worker: 'turns' }),
})

// A step on the kind that the run is handed: so a test that adds a kind needs no flow of its own.
export const onKind = flow('onKind', {
  input: { n: number(), kind: text() },
  run: async ({ input: given, step }) => step('square', () => later(given.n * given.n), { worker: given.kind }),
})

export const onAny = flow('onAny', {
  input: { n: number() },
  run: async ({ input: given, step }) => step('double', () => later(given.n * 2), { background: true }),
})

export const onHere = flow('onHere', {
  input: { n: number() },
  run: async ({ input: given, step }) => step('triple', () => given.n * 3, { background: 'here' }),
})

export const onSlow = flow('onSlow', { run: async ({ step }) => step('never', () => 1, { worker: 'slow' }) })

export const onSpill = flow('onSpill', {
  input: { n: number() },
  run: async ({ input: given, step }) => step('spill', () => given.n + 1, { worker: 'spill' }),
})

// Work on a worker that reads and writes through its writer.
export const onMarks = flow('onMarks', {
  input: { what: text() },
  run: async ({ input: given, step, db }) => {
    const before = await db.marks.count()
    return step(
      'mark',
      async () => {
        await addMark({ what: given.what })
        return { before, after: (await allMarks()).length }
      },
      { worker: 'gpu' },
    )
  },
})

// Actions whose work is a run of one step: on a thread here or on a worker of any, and on a worker of gpu alone.
export const encode = action('encode', {
  access: open,
  background: true,
  input: { n: number() },
  output: number(),
  run: async ({ input: given }) => later(given.n * 10),
})

export const encodeOnGpu = action('encodeOnGpu', {
  access: open,
  worker: 'gpu',
  limits: { time: '1 second' },
  input: { n: number() },
  output: number(),
  run: async ({ input: given }) => later(given.n * 100),
})

export const encodeNarrow = action('encodeNarrow', {
  access: open,
  worker: 'narrow',
  limits: { time: '1 minute' },
  input: { n: number() },
  output: number(),
  run: async ({ input: given }) => later(given.n),
})

export const encodeOnOldest = action('encodeOnOldest', {
  access: open,
  worker: 'oldest',
  limits: { time: '1 minute' },
  input: { n: number() },
  output: number(),
  run: async ({ input: given }) => later(given.n * 100),
})

// An action on a kind that nothing joins as, whose caller waits a second.
export const encodeOnSlow = action('encodeOnSlow', {
  access: open,
  worker: 'slow',
  limits: { time: '1 second' },
  input: { n: number() },
  output: number(),
  run: async ({ input: given }) => given.n,
})

export const failsOnGpu = action('failsOnGpu', {
  access: open,
  worker: 'gpu',
  input: { n: number() },
  run: async () => {
    throw new Error('the work of the action threw')
  },
})

// Read as an entry of the data of a page, by anyone.
export const readOnGpu = action('readOnGpu', {
  access: anyone('a page reads it as an entry of its data'),
  worker: 'gpu',
  limits: { time: '1 second' },
  input: { n: number() },
  output: number(),
  run: async ({ input: given }) => given.n + 1,
})

// Work on a worker with rows that travel with it, one that answers much, and one that reads much through its writer.
export const withRows = flow('withRows', {
  run: async ({ step }) =>
    step('count', ({ rows }) => (Array.isArray(rows.marks) ? rows.marks.length : -1), {
      worker: 'gpu',
      rows: { marks: marks.limit(100) },
    }),
})

export const answersMuch = flow('answersMuch', {
  input: { n: number() },
  run: async ({ input: given, step }) => step('words', () => 'many words '.repeat(given.n), { worker: 'gpu' }),
})

export const readsMuch = flow('readsMuch', {
  run: async ({ step, db }) => step('read', async () => (await db.marks.limit(100).all()).length, { worker: 'gpu' }),
})

// Actions that state `batch`: each entry is answered the size of its batch, or an error of its own.
export const sized = action('sized', {
  access: open,
  worker: 'gpu',
  sends: false,
  output: number(),
  batch: { max: 10 },
  limits: { time: '1 minute' },
  input: { n: number() },
  run: async ({ entries }) => entries.map((entry) => (Object(entry.input).n === 3 ? new Error('three') : entries.length)),
})

export const sizedLater = action('sizedLater', {
  access: open,
  worker: 'gpu',
  sends: false,
  output: number(),
  batch: { max: 10, wait: '2 seconds' },
  limits: { time: '1 minute' },
  input: { n: number() },
  run: async ({ entries }) => entries.map(() => entries.length),
})

export const sizedByN = action('sizedByN', {
  access: open,
  worker: 'gpu',
  sends: false,
  output: number(),
  batch: { max: 10, measure: 'n' },
  limits: { time: '1 minute' },
  input: { n: number() },
  run: async ({ entries }) => entries.map(() => entries.length),
})

export const shortList = action('shortList', {
  access: open,
  worker: 'gpu',
  sends: false,
  output: number(),
  batch: { max: 10 },
  limits: { time: '1 minute' },
  input: { n: number() },
  run: async ({ entries }) => entries.slice(1).map(() => 1),
})

export const breaks = action('breaks', {
  access: open,
  worker: 'gpu',
  sends: false,
  output: number(),
  batch: { max: 10 },
  limits: { time: '1 minute' },
  input: { n: number() },
  run: async ({ entries }) => {
    if (entries.some((entry) => Object(entry.input).n === 3)) throw new Error('one entry breaks the batch')
    return entries.map((entry) => Object(entry.input).n)
  },
})

export const breaksSplit = action('breaksSplit', {
  access: open,
  worker: 'gpu',
  sends: false,
  output: number(),
  batch: { max: 10, split: true },
  limits: { time: '1 minute' },
  input: { n: number() },
  run: async ({ entries }) => {
    if (entries.some((entry) => Object(entry.input).n === 3)) throw new Error('one entry breaks the batch')
    return entries.map((entry) => Object(entry.input).n)
  },
})

export const sizedHere = action('sizedHere', {
  access: open,
  background: true,
  sends: false,
  output: number(),
  batch: { max: 10 },
  input: { n: number() },
  run: async ({ entries }) => entries.map((entry) => Object(entry.input).n * 10),
})

// Work that keeps where it is, and hands itself back when its machine goes: the next try goes on from there.
const untilStopping = async (stopping: () => boolean): Promise<void> => {
  for (let i = 0; i < 400 && !stopping(); i++) await new Promise((done) => setTimeout(done, 10))
}

// Each try counts on from the progress of the one before, and the try that reaches `tries` answers it.
export const onSpot = flow('onSpot', {
  input: { kind: text(), tries: number() },
  run: async ({ input: given, step }) =>
    step(
      'encode',
      async ({ progress, stopping, back }) => {
        const at = Number(Object(progress() ?? { at: 0 }).at) + 1
        if (at >= given.tries) return at
        await progress({ at })
        await untilStopping(stopping)
        return back()
      },
      { worker: given.kind, time: '1 minute' },
    ),
})

// Work that keeps where it is and fails once on a thread: its second try is handed what the first kept.
export const keepsHere = flow('keepsHere', {
  run: async ({ step }) =>
    step(
      'count',
      async ({ progress }) => {
        const kept = progress()
        if (kept !== undefined) return Number(Object(kept).at) + 10
        await progress({ at: 5 })
        throw new Error('the first try fails')
      },
      { background: 'here', tries: { max: 2, wait: '1 second' } },
    ),
})

// An action whose work takes a while on its worker, so that a test can kill the worker meanwhile.
export const encodeSlowly = action('encodeSlowly', {
  access: open,
  worker: 'gpu',
  limits: { time: '10 minutes' },
  input: { n: number() },
  output: number(),
  run: async ({ input: given }) => new Promise<number>((done) => setTimeout(() => done(given.n), 3000)),
})
