import { action, agent, change, input, model, number, query, role, secret, text } from 'tentjs'
import { chats, messages, orders } from './tables'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const myOrders = query('myOrders', {
  about: 'The orders, the open ones or all',
  access: 'signedIn',
  input: { status: text({ optional: true }) },
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

export const allMessages = query('allMessages', { access: 'signedIn', input: {}, rows: messages.where({}) })

export const newChat = change('newChat', {
  access: 'signedIn',
  input: {},
  set: chats.add({ title: 'A chat' }),
})

// A tool that only the staff may use.
export const closeShop = action('closeShop', {
  about: 'Closes the shop',
  access: role('staff'),
  input: {},
  sends: false,
  run: async () => 'closed',
})

export const helper = agent('helper', {
  about: 'Answers questions about the orders',
  model: writer,
  instructions: 'You help with orders.',
  tools: [myOrders, markPaid, closeShop],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
})
