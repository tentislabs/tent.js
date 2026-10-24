import { action, agent, change, input, link, list, model, number, object, query, role, text } from 'tentjs'
import { chats, messages, orders, users } from './tables.ts'

export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const newChat = change('newChat', { access: 'anyone', input: {}, set: chats.add({ title: 'A chat' }) })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { total: number() },
  set: orders.add({ status: 'open', total: input('total') }),
})

export const myOrders = query('myOrders', {
  about: 'The orders of the person asking.',
  access: 'signedIn',
  input: {},
  rows: orders.where({}).limit(50),
})

// A tool that the staff alone may use: it is told to every starter alike.
export const staffOrders = query('staffOrders', {
  about: 'Every order, for the staff.',
  access: role('staff'),
  input: {},
  rows: orders.where({}).limit(50),
})

export const refund = action('refund', {
  about: 'Gives a customer their money back for one order.',
  access: 'signedIn',
  input: { order: link('orders') },
  output: object({ refund: link('refunds') }),
  danger: 'ask',
  run: async () => ({ refund: 'r1' }),
})

// A tool that is code, states neither reads nor touches, and sends nothing.
export const tally = action('tally', {
  about: 'Counts in code.',
  access: 'signedIn',
  input: {},
  sends: false,
  run: async () => 3,
})

// A tool that sends and asks nothing of itself: it asks where it is not trusted, and where it is under a call.
export const notify = action('notify', {
  about: 'Tells the customer.',
  access: 'signedIn',
  input: { order: link('orders') },
  run: async () => 'sent',
})

const limits = { steps: 8, perRun: { calls: 100 } }

export const inner = agent('inner', {
  about: 'Answers from inside.',
  model: writer,
  instructions: 'You answer from inside.',
  tools: [],
  access: 'signedIn',
  limits,
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [
    myOrders,
    refund,
    inner,
    staffOrders,
    { tool: tally, name: 'count', about: 'Counts the orders.' },
    { tool: refund, name: 'refundQuietly', line: false },
  ],
  sequence: true,
  access: 'signedIn',
  limits,
})

export const worded = agent('worded', {
  model: writer,
  instructions: 'You help in other words.',
  tools: [myOrders],
  words: { gives: 'Answers {}.' },
  access: 'signedIn',
  limits,
})

export const lister = agent('lister', {
  model: writer,
  instructions: 'You help from a list.',
  tools: [myOrders, refund, tally],
  tell: 'list',
  sequence: true,
  access: 'signedIn',
  limits,
})

// An agent that trusts its one tool, and another that calls it: under that call the trusted tool asks.
export const trusting = agent('trusting', {
  about: 'Refunds as it is trusted to.',
  model: writer,
  instructions: 'You refund.',
  tools: [notify],
  trust: [notify],
  access: 'signedIn',
  limits,
})

export const asker = agent('asker', {
  model: writer,
  instructions: 'You ask another.',
  tools: [trusting],
  access: 'signedIn',
  limits,
})

export const knower = agent('knower', {
  model: writer,
  instructions: 'You know who and when.',
  tools: [],
  knows: ['caller', 'time'],
  memory: { in: messages, thread: 'chat' },
  access: 'anyone',
  limits,
})

// An agent that keeps a conversation and is told its tools as a list: a test changes how it is told them.
export const remembering = agent('remembering', {
  model: writer,
  instructions: 'You remember.',
  tools: [tally],
  tell: 'list',
  memory: { in: messages, thread: 'chat' },
  access: 'signedIn',
  limits,
})
