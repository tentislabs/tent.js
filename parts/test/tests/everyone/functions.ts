import { agent, change, choice, input, json, link, list, model, query, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const orders = table('orders', {
  columns: { title: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const openOrders = query('openOrders', { access: 'signedIn', rows: orders.oldest('title') })

// One change that the page, the API, MCP and the command line all call.
export const addOrder = change('addOrder', {
  about: 'Adds an order',
  access: 'signedIn',
  offer: ['api', 'mcp', 'cli'],
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const chats = table('chats', {
  columns: { title: text({ optional: true }), user: link('users') },
  owner: 'user',
  access: { read: 'owner', add: 'signedIn', remove: 'owner' },
})

export const messages = table('messages', {
  columns: {
    chat: link('chats', { onRemove: 'remove' }),
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ lines: 'many', optional: true }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    user: link('users', { optional: true }),
  },
  owner: 'user',
  access: { read: 'owner' },
})

export const chatMessages = query('chatMessages', {
  input: { chat: link('chats') },
  access: 'signedIn',
  rows: messages.where({ chat: input('chat'), who: { in: ['user', 'assistant'] } }).limit(200),
})

export const helper = agent('helper', {
  about: 'Answers about the orders',
  model: writer,
  instructions: 'Answer about the orders.',
  tools: [openOrders],
  access: 'signedIn',
  limits: { steps: 6, perRun: { tokensOut: 20000 } },
  memory: { in: messages, thread: 'chat' },
})

export const newChat = change('newChat', { access: 'signedIn', input: {}, set: chats.add({ title: 'A chat' }) })
