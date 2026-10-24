import { action, anyone, json, post, secret, service, text } from 'tentjs'

// The ledger of the tests, at the stand-in server that a test starts: its address is written in by the test.
export const ledger = service('ledger', {
  url: 'http://127.0.0.1:1',
  auth: { bearer: secret('LEDGER_KEY') },
  limits: { perSecond: 2 },
  calls: { book: post('/book', { input: { tag: text() } }) },
})

export const bookOnGpu = action('bookOnGpu', {
  access: anyone('a test books from a worker'),
  worker: 'gpu',
  limits: { time: '1 minute' },
  input: { tag: text() },
  output: json(),
  run: async ({ input }) => ledger.book({ tag: input.tag }),
})

export const bookOnCpu = action('bookOnCpu', {
  access: anyone('a test books from a worker that holds no secret'),
  worker: 'cpu',
  limits: { time: '1 minute' },
  input: { tag: text() },
  output: json(),
  run: async ({ input }) => ledger.book({ tag: input.tag }),
})
