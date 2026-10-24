import { action, agent, change, flow, input, list, model, number, text } from 'tentjs'
import { users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

// A step on a worker of gpu that says twice how far it has come, a while apart.
export const stepped = flow('stepped', {
  as: 'starter',
  access: 'signedIn',
  input: { n: number() },
  run: async ({ input: given, step }) =>
    step(
      'count',
      async ({ progress }) => {
        await progress({ at: 1 })
        await new Promise((done) => setTimeout(done, 1500))
        await progress({ at: 2 })
        return given.n
      },
      { worker: 'gpu', time: '1 minute' },
    ),
})

// A step on a worker of gpu, of one minute at the most, which its starter runs.
export const square = flow('square', {
  as: 'starter',
  access: 'signedIn',
  input: { n: number() },
  run: async ({ input: given, step }) => step('square', () => given.n * given.n, { worker: 'gpu', time: '1 minute' }),
})

// The same on a kind that is counted with the caller empty.
export const squareCheap = flow('squareCheap', {
  as: 'starter',
  access: 'signedIn',
  input: { n: number() },
  run: async ({ input: given, step }) => step('square', () => given.n * given.n, { worker: 'cheap', time: '1 minute' }),
})

// An action on a worker of gpu, which a caller at the door waits for.
export const encode = action('encode', {
  access: 'signedIn',
  worker: 'gpu',
  sends: false,
  limits: { time: '1 minute' },
  input: { n: number() },
  output: number(),
  run: async ({ input: given }) => given.n,
})

// A second one, whose own `perDay` a test sets.
export const resize = action('resize', {
  access: 'signedIn',
  worker: 'gpu',
  sends: false,
  limits: { time: '1 minute' },
  input: { n: number() },
  output: number(),
  run: async ({ input: given }) => given.n,
})

// A batch whose seconds are shared among its entries by `n`.
export const measured = action('measured', {
  access: 'signedIn',
  worker: 'gpu',
  sends: false,
  batch: { max: 10, measure: 'n' },
  limits: { time: '1 minute' },
  input: { n: number() },
  output: number(),
  run: async ({ entries }) => entries.map((entry) => entry.input.n),
})

// Work that asks a model, on a worker: the worker makes the call, or its writer where `outside` says so.
export const thinker = model('thinker', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

export const thinkOnGpu = flow('thinkOnGpu', {
  as: 'starter',
  access: 'signedIn',
  run: async ({ step }) => step('think', () => thinker.reply('Say hello.'), { worker: 'gpu', time: '1 minute' }),
})

// Work that fetches an address that opens no connection, on a worker: the worker fetches it itself.
export const fetchOnGpu = flow('fetchOnGpu', {
  as: 'starter',
  access: 'signedIn',
  run: async ({ step }) =>
    step('fetch', async () => (await fetch('data:text/plain,fetched')).text(), { worker: 'gpu', time: '1 minute' }),
})

// Work on a worker that says how far it has come, two hundred times in a second, to whoever follows its run.
export const sayOnGpu = flow('sayOnGpu', {
  as: 'starter',
  access: 'signedIn',
  follow: 'signedIn',
  output: number(),
  run: async ({ step }) =>
    step(
      'count',
      async ({ say }) => {
        for (let at = 1; at <= 200; at++) {
          say({ at })
          await new Promise((done) => setTimeout(done, 5))
        }
        return 200
      },
      { worker: 'gpu', time: '1 minute' },
    ),
})

// An agent whose one tool is heavy work: its run may use ten seconds of it.
export const helper = agent('helper', {
  model: thinker,
  instructions: 'You help.',
  tools: [encode],
  access: 'signedIn',
  limits: { steps: 4, perRun: { workSeconds: 10 } },
})
