import { action, anyone, change, flow, input, list, number, object, query, runs, start, text } from 'tentjs'
import { marks, users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

// An order that a page calls: one run for each order, which answers its starter what only the starter may read.
export const order = flow('order', {
  access: 'signedIn',
  as: 'starter',
  input: { order: text() },
  output: text(),
  key: ({ input }) => input.order,
  together: { then: 'join' },
  run: async ({ input, step }) => {
    await step.waitFor('handed over')
    return `the address of ${input.order}`
  },
})

// The same start from code that has no full access: the start is the caller's.
export const startOrder = action('startOrder', {
  access: 'signedIn',
  input: { order: text() },
  output: text(),
  run: async ({ input }) => start(order, { order: input.order }).run,
})

// A flow whose starts wait until no start of their key came for half a minute.
export const paced = flow('paced', {
  input: { key: text() },
  key: ({ input }) => input.key,
  pace: { debounce: '30 seconds' },
  run: async ({ input, step }) => step('note', () => addMark({ what: `paced ${input.key}` })),
})

// Anyone may poke: each poke starts the paced flow.
export const poke = change('poke', {
  access: anyone('a page that nobody signed in to pokes'),
  input: { key: text() },
  run: ({ input }) => {
    start(paced, { key: input.key })
  },
})

// Work on many runs at once, from code that states no full access.
export const stopOrders = action('stopOrders', {
  access: 'signedIn',
  output: object({ count: number(), runs: list(text()) }),
  run: async () => runs.stopAll({ flow: 'order' }),
})

export const replayOrders = action('replayOrders', {
  access: 'signedIn',
  output: object({ count: number(), runs: list(text()), started: list(text()) }),
  run: async () => runs.replayAll({ flow: 'order' }),
})

// A charge keeps a card that its step was told, and that its input does not hold, in a sealed step, and waits.
export const charge = flow('charge', {
  input: { last: text() },
  run: async ({ input, step }) => {
    await step('card', () => ({ card: `4242-${input.last}` }), { sealed: true })
    await step.waitFor('settled')
  },
})

// Another run, with full access, that reads the steps of a charge.
export const snoop = flow('snoop', {
  input: { run: text() },
  output: text(),
  run: async ({ input, step }) => step('read', async () => JSON.stringify(await runs.read(input.run))),
})
