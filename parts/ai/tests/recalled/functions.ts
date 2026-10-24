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

// A writer that may search the web and run code on its provider's side, and a third tool it does not name.
export const surfer = model('surfer', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
  hosted: ['webSearch', 'codeExecution'],
})

export const chats = table('chats', {
  columns: { title: text({ optional: true }), by: link('users', { optional: true }) },
  owner: 'by',
  access: { read: 'owner', add: 'signedIn' },
})

// The meaning of each message is filled by the engine from its text.
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
  access: { read: 'owner' },
})

// What each person told an agent to keep of them.
export const preferences = table('preferences', {
  columns: { fact: text(), by: link('users', { optional: true }) },
  owner: 'by',
  access: { read: 'owner', add: 'owner', remove: 'owner' },
})

export const browser = agent('browser', {
  about: 'Looks things up',
  model: surfer,
  instructions: 'Look it up.',
  tools: [],
  trust: ['webSearch'],
  access: 'signedIn',
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

// Sends of the older turns of the conversation the one nearest to the new message.
export const recaller = agent('recaller', {
  about: 'Remembers the conversation',
  model: writer,
  instructions: 'You remember.',
  tools: [],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat', keep: 1, shrink: { nearest: 1 } },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

// The facts of a person are written by changes of the builder's own, which the agent is given as tools.
export const remember = change('remember', {
  about: 'Keeps one fact about the person you are talking with',
  access: 'signedIn',
  input: { fact: text() },
  set: preferences.add({ fact: input('fact'), by: caller('id') }),
})

export const forget = change('forget', {
  about: 'Drops one fact about the person, by its id',
  access: 'signedIn',
  input: { id: text() },
  set: preferences.remove(input('id')),
})

// Recalls from every conversation of the person, and is told the facts about them.
export const keeper = agent('keeper', {
  about: 'Remembers the person',
  model: writer,
  instructions: 'You keep what matters.',
  tools: [remember, forget],
  access: 'signedIn',
  knows: [{ facts: preferences }],
  memory: { in: messages, thread: 'chat', keep: 1, shrink: 'drop', recall: 2 },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})
