import { action, agent, change, choice, files, json, link, list, model, query, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const chats = table('chats', {
  columns: { title: text({ optional: true }), by: link('users', { optional: true }) },
  owner: 'by',
  access: { read: 'owner', add: 'signedIn' },
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

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// A model that takes little, so that a conversation soon does not fit it.
export const small = model('small', { provider: 'openai-style', name: 'tiny', url: 'http://127.0.0.1:1/v1', abilities: ['reply', 'tools'], takes: 400 })

export const newChat = change('newChat', { access: 'signedIn', input: {}, set: chats.add({ title: 'A chat' }) })

export const allMessages = query('allMessages', { access: 'signedIn', input: {}, rows: messages.where({}) })

// Keeps a text of the caller's own as a file, and answers its id.
export const keepNote = action('keepNote', {
  access: 'signedIn',
  input: { words: text() },
  output: text(),
  run: async ({ input }) => files.put(input.words, { name: 'note.txt', kind: 'text/plain' }),
})

// A shortening of the builder's own.
export const shorten = action('shorten', {
  access: 'signedIn',
  input: { rows: json() },
  output: text(),
  sends: false,
  run: async ({ input }) => `shortened ${Array.isArray(input.rows) ? input.rows.length : 0} rows`,
})

const base = { model: writer, instructions: 'You help.', tools: [], access: 'signedIn' as const }

export const helper = agent('helper', { ...base, memory: { in: messages, thread: 'chat' }, limits: { steps: 4, perRun: { calls: 100 } } })

export const summed = agent('summed', {
  ...base,
  memory: { in: messages, thread: 'chat', keep: 2, after: 3, shrink: 'summary' },
  limits: { steps: 4, perRun: { calls: 100 } },
})

export const ownShort = agent('ownShort', {
  ...base,
  memory: { in: messages, thread: 'chat', keep: 1, after: 1, shrink: shorten },
  limits: { steps: 4, perRun: { calls: 100 } },
})

export const tight = agent('tight', {
  ...base,
  model: small,
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 4, perRun: { calls: 100 } },
})
