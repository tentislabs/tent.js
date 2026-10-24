import { action, agent, change, choice, input, json, list, number, query, table, text } from 'tentjs'
import { writer } from './models'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { item: text(), total: number(), status: choice(['open', 'paid']) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
})

export const myOrders = query('myOrders', {
  about: 'The orders',
  access: 'signedIn',
  input: {},
  rows: orders.where({}),
})

export const markPaid = change('markPaid', {
  about: 'Marks an order as paid',
  access: 'signedIn',
  input: { order: text() },
  set: orders.change(input('order'), { status: 'paid' }),
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { item: text(), total: number() },
  set: orders.add({ item: input('item'), total: input('total'), status: 'open' }),
})

export const thank = action('thank', {
  about: 'Thanks the person',
  access: 'signedIn',
  input: { words: text() },
  output: text(),
  sends: false,
  run: async ({ input }) => `Thanks: ${input.words}`,
})

// One fill of the model, from code.
export const judgeIt = action('judgeIt', {
  access: 'signedIn',
  input: {},
  output: json(),
  sends: false,
  run: async () => writer.fill({ score: number(), why: text() }, 'Judge it.'),
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help with orders.',
  tools: [myOrders, markPaid, thank],
  access: 'signedIn',
  limits: { steps: 6, perRun: { calls: 20 } },
})
