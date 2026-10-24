import {
  action,
  agent,
  change,
  fail,
  file,
  files,
  flow,
  input,
  mail,
  model,
  number,
  object,
  post,
  query,
  service,
  text,
} from 'tentjs'
import { notes } from './tables.ts'

/** The processor time of this thread so far, in milliseconds. */
function worked(): number {
  const used = process.threadCpuUsage()
  return (used.user + used.system) / 1000
}

/**
 * Does as much work as the processor time it is told, and nothing else: on a busy computer that takes longer than
 * the time, and counts the same. Work under a millisecond is held by the clock of the wall, as the processor clock of
 * a thread moves in steps of some 16 ms on Windows.
 */
function hold(ms: number): void {
  const from = worked()
  const wall = performance.now()
  while (ms < 1 ? performance.now() - wall < ms : worked() - from < ms) {
    // Busy on purpose: the time is processor time.
  }
}

export const listNotes = query('listNotes', { access: 'anyone', input: {}, rows: notes.newest('createdAt').limit(50) })

export const addNote = change('addNote', {
  access: 'anyone',
  input: { title: text() },
  set: notes.add({ title: input('title') }),
})

export const addTwo = change('addTwo', {
  access: 'anyone',
  input: {},
  set: [notes.add({ title: 'one' }), notes.add({ title: 'two' })],
})

export const broken = query('broken', { access: 'anyone', input: {}, run: () => fail('broken', 'It breaks.') })

// An action that calls a change and a query from code, and holds the processor between them.
export const outer = action('outer', {
  access: 'anyone',
  input: {},
  output: number(),
  run: async () => {
    hold(100)
    await addNote({ title: 'from code' })
    const read = await listNotes({})
    return Array.isArray(read) ? read.length : 0
  },
})

export const shipper = service('shipper', {
  url: 'https://shipper.example',
  calls: { ship: post('/ship', { input: { order: text() }, output: object({ id: text() }) }) },
})

// An action on the main thread that holds the processor, waits for a service, and holds it again.
export const busy = action('busy', {
  access: 'anyone',
  input: {},
  output: text(),
  run: async () => {
    hold(100)
    await shipper.ship({ order: 'o1' })
    hold(100)
    return 'done'
  },
})

// An action that only waits.
export const waiter = action('waiter', {
  access: 'anyone',
  input: {},
  output: text(),
  run: async () => {
    await new Promise((done) => setTimeout(done, 150))
    return 'waited'
  },
})

// Work on a background thread that holds the processor for as long as it is told.
export const heavy = action('heavy', {
  access: 'anyone',
  input: { ms: number() },
  output: text(),
  background: 'here',
  run: async ({ input }) => {
    hold(input.ms)
    return 'held'
  },
})

export const tidy = flow('tidy', {
  input: {},
  run: async ({ step }) => {
    await step('first', () => 'one')
    await step('second', () => 'two')
  },
})

export const tellNote = action('tellNote', {
  access: 'anyone',
  input: { to: text() },
  output: text(),
  run: async ({ input }) => {
    await mail.send({ from: 'shop@example.com', to: input.to, subject: 'A note', text: 'Hello from the shop.' })
    return 'sent'
  },
})

export const fetchNews = action('fetchNews', {
  access: 'anyone',
  input: { url: text() },
  output: text(),
  run: async ({ input }) => (await fetch(input.url)).text(),
})

export const keepPaper = action('keepPaper', {
  access: 'anyone',
  input: { text: text() },
  output: text(),
  run: async ({ input }) => files.put(new TextEncoder().encode(input.text), { name: 'paper.txt', kind: 'text/plain' }),
})

export const paperOf = query('paperOf', { access: 'anyone', input: { paper: file() }, run: ({ input }) => input.paper })

export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

export const shipping = model('shipping', { provider: 'service', name: 'ship-1', call: shipper.ship })

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [listNotes],
  access: 'anyone',
  limits: { steps: 4, perRun: { calls: 100 } },
})
