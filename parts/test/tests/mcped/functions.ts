import { action, anyone, change, flow, input, json, link, list, number, object, query, role, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { title: text(), total: number({ optional: true }), placedBy: link('users', { optional: true }) },
  owner: 'placedBy',
  access: { read: 'owner', add: 'signedIn', change: 'owner', remove: 'owner' },
})

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const openOrders = query('openOrders', {
  about: 'The orders that the caller placed',
  access: 'signedIn',
  offer: ['mcp'],
  input: { limit: number({ optional: true }) },
  output: list(object({ title: text() })),
  run: ({ db, input }) =>
    db.orders
      .all()
      .slice(0, input.limit ?? 50)
      .map((one) => ({ title: one.title })),
})

export const addOrder = change('addOrder', {
  about: 'Adds an order for the caller',
  access: 'signedIn',
  offer: ['mcp'],
  input: { title: text({ min: 2 }), total: number({ optional: true }) },
  output: object({ id: text() }),
  run: ({ db, user, input }) => ({
    id: db.orders.add({ title: input.title, total: input.total, placedBy: user?.id }).id,
  }),
})

export const addNote = change('addNote', {
  about: 'Writes a note',
  access: 'signedIn',
  offer: ['mcp'],
  input: { words: text() },
  set: notes.add({ words: input('words') }),
})

export const removeOrder = change('removeOrder', {
  about: 'Removes one order',
  access: 'signedIn',
  offer: ['mcp'],
  danger: 'ask',
  input: { order: text(), note: text({ secret: true, optional: true }) },
  run: ({ db, input }) => {
    db.orders.remove(input.order)
  },
})

export const sendReceipt = action('sendReceipt', {
  about: 'Sends the receipt of an order',
  access: 'signedIn',
  offer: ['mcp'],
  input: { order: text() },
  // Code that no reader of a body takes, so the action is code and sends data out.
  run: async ({ input }) => ({ sent: typeof globalThis.fetch === 'function' && input.order !== '' }),
})

export const peek = action('peek', {
  about: 'Looks at the time of the app',
  access: 'signedIn',
  offer: ['mcp'],
  changes: false,
  sends: false,
  input: {},
  output: object({ at: text() }),
  run: async () => ({ at: 'now' }),
})

export const staffTotals = query('staffTotals', {
  about: 'The total of every order, for the staff',
  access: role('staff'),
  system: 'sums the orders of every caller',
  offer: ['mcp'],
  input: {},
  output: number(),
  run: ({ db }) => db.system.orders.all().reduce((sum, one) => sum + (one.total ?? 0), 0),
})

export const titles = query('titles', {
  about: 'The titles of the orders of the caller, as a list',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: list(text()),
  run: ({ db }) => db.orders.all().map((one) => one.title),
})

export const forget = change('forget', {
  about: 'Forgets nothing, and answers nothing',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  run: () => undefined,
})

export const renamedTool = query('renamedTool', {
  about: 'A query whose tool has another name',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'renamed',
})

export const openToAll = query('openToAll', {
  about: 'Words that everyone may read',
  access: anyone('the words are public'),
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'open words',
})

export const hidden = query('hidden', {
  about: 'A query that is offered to no outside door',
  access: 'signedIn',
  input: {},
  output: text(),
  run: () => 'hidden',
})

export const onlyApi = query('onlyApi', {
  about: 'A query that is offered to the API alone',
  access: 'signedIn',
  offer: ['api'],
  input: {},
  output: text(),
  run: () => 'api',
})

// What answers a method of the standard that the layer does not answer itself.
export const listResources = query('listResources', {
  about: 'The resources of the app',
  access: 'signedIn',
  input: { params: json({ optional: true }) },
  output: json(),
  run: ({ user }) => ({ resources: [{ uri: 'tent://orders', name: `orders of ${user?.id}` }] }),
})

export const secretPrompt = query('secretPrompt', {
  about: 'A prompt that only the staff may read',
  access: role('staff'),
  input: { params: json({ optional: true }) },
  output: json(),
  run: () => ({ messages: [] }),
})

export const bigJob = flow('bigJob', {
  about: 'Counts the letters of a word, in a run',
  access: 'signedIn',
  offer: ['mcp'],
  as: 'starter',
  input: { word: text() },
  output: object({ letters: number() }),
  run: async ({ input, step }) => step('count', () => ({ letters: input.word.length, more: 'not in the output' })),
})

export const slowJob = flow('slowJob', {
  about: 'Waits an hour in a run',
  access: 'signedIn',
  offer: ['mcp'],
  as: 'starter',
  input: { word: text() },
  output: object({ word: text() }),
  run: async ({ input, step }) => {
    await step.wait('1 hour')
    return step('after', () => ({ word: input.word }))
  },
})

export const pagesOnly = flow('pagesOnly', {
  about: 'A flow that the pages of the app may call',
  access: 'signedIn',
  as: 'starter',
  input: { word: text() },
  output: object({ word: text() }),
  run: async ({ input, step }) => step('echo', () => ({ word: input.word })),
})
