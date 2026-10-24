import { agent, caller, change, choice, input, json, link, list, model, secret, table, text, vector } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const embedder = model('embedder', {
  provider: 'openai',
  name: 'text-embedding-3-small',
  key: secret('OPENAI_KEY'),
  abilities: ['embed'],
})

export const chats = table('chats', {
  columns: { title: text({ optional: true }), by: link('users', { optional: true }) },
  owner: 'by',
  access: { read: 'signedIn', add: 'signedIn' },
})

// Every signed-in person may read every message: recall still never crosses starters.
export const messages = table('messages', {
  columns: {
    chat: link('chats'),
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ lines: 'many', optional: true }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    by: link('users', { optional: true }),
    meaning: vector({ size: 3, model: embedder, optional: true, by: 'text' }),
  },
  owner: 'by',
  access: { read: 'signedIn' },
})

// Every signed-in person may read every fact: the facts sent are still the starter's own.
export const preferences = table('preferences', {
  columns: { fact: text(), by: link('users', { optional: true }) },
  owner: 'by',
  access: { read: 'signedIn', add: 'owner', remove: 'owner' },
})

// A fact is written by a change of the builder's own, given to the agent as a tool.
export const remember = change('remember', {
  about: 'Keeps one fact about the person you are talking with',
  access: 'signedIn',
  input: { fact: text() },
  set: preferences.add({ fact: input('fact'), by: caller('id') }),
})

export const keeper = agent('keeper', {
  about: 'Remembers the person',
  model: writer,
  instructions: 'You keep what matters.',
  tools: [remember],
  access: 'signedIn',
  knows: [{ facts: preferences }],
  memory: { in: messages, thread: 'chat', keep: 1, shrink: 'drop', recall: 3 },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

// Recalls inside one conversation, which two people may share.
export const sharer = agent('sharer', {
  about: 'Remembers one conversation',
  model: writer,
  instructions: 'You remember the conversation.',
  tools: [],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat', keep: 1, shrink: 'drop', recall: 3 },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})
