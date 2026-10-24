import { action, agent, change, input, link, model, number, object, query, role, secret, text } from 'tentjs'
import { lates, orders, receipts, refunds, users } from './tables'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// A model that answers no typed value: a sequence of its agent holds no `fill`.
export const plainWriter = model('plainWriter', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
  abilities: ['reply', 'tools'],
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text() },
  set: users.add({ name: input('name'), roles: [] }),
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { item: text(), total: number() },
  set: orders.add({ item: input('item'), total: input('total'), status: 'open' }),
})

// The writes of the tools, which an action makes through a change.
export const addRefund = change('addRefund', {
  access: 'signedIn',
  input: { order: link('orders') },
  set: refunds.add({ order: input('order') }),
})

export const addReceipt = change('addReceipt', {
  access: 'signedIn',
  input: { order: link('orders'), refund: link('refunds') },
  set: receipts.add({ order: input('order'), refund: input('refund') }),
})

export const addLate = change('addLate', {
  access: 'signedIn',
  input: { order: link('orders') },
  set: lates.add({ order: input('order') }),
})

export const myOrders = query('myOrders', {
  about: 'The orders',
  access: 'signedIn',
  input: {},
  rows: orders.where({}),
})

export const allRefunds = query('allRefunds', { access: 'signedIn', input: {}, rows: refunds.where({}) })
export const allReceipts = query('allReceipts', { access: 'signedIn', input: {}, rows: receipts.where({}) })

// The money of one order back: a person is asked before it runs.
export const refund = action('refund', {
  about: 'Gives the money back for one order',
  access: 'signedIn',
  input: { order: link('orders') },
  output: object({ refund: link('refunds') }),
  danger: 'ask',
  run: async ({ input }) => {
    const made = await addRefund({ order: input.order })
    return { refund: String(Object(made).id) }
  },
})

export const mailReceipt = action('mailReceipt', {
  about: 'Mails the receipt of a refund',
  access: 'signedIn',
  input: { order: link('orders'), refund: link('refunds') },
  output: text(),
  sends: false,
  run: async ({ input }) => {
    await addReceipt({ order: input.order, refund: input.refund })
    return 'mailed'
  },
})

export const mailAsking = action('mailAsking', {
  about: 'Mails the receipt of a refund, and asks first',
  access: 'signedIn',
  input: { order: link('orders'), refund: link('refunds') },
  output: text(),
  danger: 'ask',
  run: async ({ input }) => {
    await addReceipt({ order: input.order, refund: input.refund })
    return 'mailed'
  },
})

/// A tool that asks nothing and writes one row, so that what a sequence did can be counted.
export const markLate = action('markLate', {
  about: 'Marks one order late',
  access: 'signedIn',
  input: { order: link('orders') },
  output: text(),
  sends: false,
  run: async ({ input }) => {
    await addLate({ order: input.order })
    return `late ${input.order}`
  },
})

export const allLates = query('allLates', { access: 'signedIn', input: {}, rows: lates.where({}) })

// A tool that only the staff may use.
export const closeShop = action('closeShop', {
  about: 'Closes the shop',
  access: role('staff'),
  input: {},
  output: text(),
  sends: false,
  run: async () => 'closed',
})

// A tool that fails, for what a model is handed of a call that failed.
export const broken = action('broken', {
  about: 'Always fails',
  access: 'signedIn',
  input: { order: link('orders') },
  output: text(),
  sends: false,
  run: async () => {
    throw new Error('broken on purpose')
  },
})

const limits = { steps: 12, perRun: { tokensOut: 50000 }, toolsAtOnce: 4 }

export const helper = agent('helper', {
  about: 'Refunds the late orders',
  model: writer,
  instructions: 'You refund.',
  tools: [myOrders, refund, mailReceipt, markLate, closeShop, broken],
  sequence: true,
  access: 'signedIn',
  limits,
})

// The same tools, with a mail that asks too.
export const asking = agent('asking', {
  model: writer,
  instructions: 'You refund and ask.',
  tools: [myOrders, refund, { tool: mailAsking, name: 'mailReceipt' }],
  sequence: true,
  access: 'signedIn',
  limits,
})

export const tight = agent('tight', {
  model: writer,
  instructions: 'You refund within a few calls.',
  tools: [myOrders, refund, mailReceipt],
  sequence: true,
  access: 'signedIn',
  limits: { ...limits, toolCalls: 4, result: '2 KB' },
})

export const listing = agent('listing', {
  model: plainWriter,
  instructions: 'You refund from a list.',
  tools: [myOrders, refund, mailReceipt],
  sequence: true,
  tell: 'list',
  access: 'signedIn',
  limits,
})
