import { action, agent, change, list, model, number, query, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { item: text(), total: number() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })
export const grader = model('grader', { provider: 'anthropic', name: 'claude-haiku-4-5', key: secret('ANTHROPIC_KEY') })

export const myOrders = query('myOrders', { about: 'The orders', access: 'signedIn', input: {}, rows: orders.where({}) })

export const addOrder = change('addOrder', {
  about: 'Adds an order',
  access: 'signedIn',
  input: { item: text() },
  set: orders.add({ item: 'tent', total: 120 }),
})

export const refund = action('refund', {
  about: 'Gives the money back',
  access: 'signedIn',
  input: {},
  output: text(),
  danger: 'ask',
  run: async () => 'refunded',
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'Answer in full.',
  tools: [myOrders, addOrder, refund],
  access: 'signedIn',
  limits: { steps: 6, perRun: { calls: 100 } },
})
