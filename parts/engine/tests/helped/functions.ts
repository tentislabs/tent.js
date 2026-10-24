import { action, agent, change, flow, input, json, list, mail, model, query, text } from 'tentjs'
import { chats, messages, orders, users } from './tables.ts'

export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const newChat = change('newChat', { access: 'anyone', input: {}, set: chats.add({ title: 'A chat' }) })

export const myOrders = query('myOrders', { about: 'The orders', access: 'anyone', input: {}, rows: orders.where({}) })

// A tool that asks before it runs.
export const refund = action('refund', {
  about: 'Gives the money back',
  access: 'anyone',
  input: { order: text() },
  output: text(),
  danger: 'ask',
  run: async ({ input }) => `refunded ${input.order}`,
})

// A tool that states it sends nothing, and mails: its step waits for a yes, and is made again after it.
export const quietMail = action('quietMail', {
  about: 'Mails quietly',
  access: 'anyone',
  input: {},
  output: text(),
  sends: false,
  run: async () => {
    await mail.send({ from: 'shop@example.com', to: 'b@example.com', subject: 'C', text: 'D' })
    return 'mailed'
  },
})

// A flow tool whose step runs in a loop, each pass a mail that nobody agreed to.
export const tidy = flow('tidy', {
  about: 'Mails twice',
  access: 'anyone',
  as: 'starter',
  input: {},
  output: text(),
  sends: false,
  run: async ({ step }) => {
    for (let pass = 0; pass < 2; pass++)
      await step('mail', () => mail.send({ from: 'shop@example.com', to: 'a@example.com', subject: 'A', text: 'B' }))
    return 'tidied'
  },
})

// A flow tool that waits for a yes of its own making.
export const selfWait = flow('selfWait', {
  about: 'Waits for itself',
  access: 'anyone',
  as: 'starter',
  input: {},
  output: text(),
  sends: false,
  run: async ({ step }) => {
    await step.waitFor('go on')
    return 'went on'
  },
})

const limits = { steps: 8, perRun: { calls: 100 } }

// An agent that is a tool, and asks for its own tool.
export const inner = agent('inner', {
  about: 'Refunds from inside',
  model: writer,
  instructions: 'You refund.',
  tools: [refund],
  access: 'anyone',
  limits,
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [myOrders, refund, quietMail, tidy, selfWait, inner],
  access: 'anyone',
  memory: { in: messages, thread: 'chat' },
  together: { then: 'wait' },
  limits,
})

// An agent that keeps a conversation, and refuses a second start on it while one works.
export const strict = agent('strict', {
  model: writer,
  instructions: 'You are strict.',
  tools: [],
  access: 'anyone',
  memory: { in: messages, thread: 'chat' },
  limits,
})

// An action that starts the helper from code and waits for its answer.
export const askHelper = action('askHelper', {
  access: 'anyone',
  input: { message: text() },
  output: json(),
  run: async ({ input }) => helper({ message: input.message }),
})

// An action that starts the helper from code with an input that does not fit.
export const askBadly = action('askBadly', {
  access: 'anyone',
  input: {},
  output: json(),
  run: async () => Reflect.apply(helper, undefined, [{ message: 7 }]),
})

export const other = agent('other', {
  model: writer,
  instructions: 'You help too.',
  tools: [refund],
  access: 'anyone',
  limits,
})

// An agent that states no `access`: nothing reaches it through the door.
export const closed = agent('closed', {
  model: writer,
  instructions: 'You are closed.',
  tools: [],
  limits,
})

// An ordinary flow, offered to the pages.
export const plain = flow('plain', {
  access: 'anyone',
  input: {},
  output: text(),
  run: async ({ step }) => {
    await step.waitFor('go on')
    return 'plain'
  },
})
