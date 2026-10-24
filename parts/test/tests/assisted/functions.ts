import { action, agent, change, choice, input, json, link, list, model, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const chats = table('chats', {
  columns: { title: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const messages = table('messages', {
  columns: {
    chat: link('chats'),
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ lines: 'many', optional: true }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    by: link('users', { optional: true }),
  },
  owner: 'by',
  access: { read: 'owner' },
})

// A model whose provider the project makes in engine.ts: it answers what it is told, and asks for a refund first.
export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const newChat = change('newChat', { access: 'signedIn', input: {}, set: chats.add({ title: 'A chat' }) })

export const refund = action('refund', {
  about: 'Gives the money back',
  access: 'signedIn',
  input: { order: text() },
  output: text(),
  danger: 'ask',
  run: async ({ input }) => `refunded ${input.order}`,
})

export const helper = agent('helper', {
  about: 'Helps',
  model: writer,
  instructions: 'You help.',
  tools: [refund],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 6, perRun: { calls: 100 } },
})
