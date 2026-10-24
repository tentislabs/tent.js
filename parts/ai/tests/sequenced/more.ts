import { action, agent, change, input, link, table, text } from 'tentjs'
import { markLate, myOrders, refund, writer } from './functions'

// What the tests of the further sentences of a sequence add: a tool that sends and asks nothing, agents that
// trust it, call another, ask within a minute, hold small answers, and one that a trigger starts.

export const pings = table('pings', {
  columns: { words: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const addPing = change('addPing', {
  access: 'signedIn',
  input: { words: text() },
  set: pings.add({ words: input('words') }),
})

// It sends data out, as an action with no `sends: false` does, and asks nobody of itself.
export const notify = action('notify', {
  about: 'Tells the customer of an order',
  access: 'signedIn',
  input: { order: link('orders') },
  output: text(),
  run: async ({ input }) => `told ${input.order}`,
})

const limits = { steps: 12, perRun: { tokensOut: 50000 }, toolsAtOnce: 4 }

export const trustedSeq = agent('trustedSeq', {
  about: 'Tells the customers',
  model: writer,
  instructions: 'You tell, trusted.',
  tools: [myOrders, notify],
  trust: [notify],
  sequence: true,
  access: 'signedIn',
  limits,
})

export const outerSeq = agent('outerSeq', {
  model: writer,
  instructions: 'You ask another to tell.',
  tools: [trustedSeq],
  access: 'signedIn',
  limits,
})

export const quickAsk = agent('quickAsk', {
  model: writer,
  instructions: 'You refund, and wait a minute for a yes.',
  tools: [myOrders, refund],
  sequence: true,
  access: 'signedIn',
  limits: { ...limits, ask: '1 minute' },
})

export const narrow = agent('narrow', {
  model: writer,
  instructions: 'You refund many with small answers.',
  tools: [myOrders, refund],
  sequence: true,
  access: 'signedIn',
  limits: { ...limits, toolCalls: 200, result: '1 KB' },
})

export const pinged = agent('pinged', {
  model: writer,
  instructions: 'You act on a ping.',
  tools: [myOrders, refund, markLate],
  sequence: true,
  on: pings.added(),
  access: 'signedIn',
  limits,
})
