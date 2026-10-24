import { action, agent, choice, json, link, list, model, role, secret, table, text } from 'tentjs'

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

// Code that sends: it asks a person first, unless the agent trusts it.
export const sendNote = action('sendNote', {
  about: 'Sends a note to the team',
  access: 'signedIn',
  input: { words: text() },
  output: text(),
  run: async ({ input }) => ['sent', input.words].join(': '),
})

export const billing = agent('billing', {
  about: 'Answers of bills',
  model: writer,
  instructions: 'You are billing.',
  tools: [sendNote],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
})

export const staffDesk = agent('staffDesk', {
  about: 'Answers for the staff',
  model: writer,
  instructions: 'You are the staff desk.',
  tools: [],
  access: role('staff'),
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
})

export const front = agent('front', {
  about: 'Answers first',
  model: writer,
  instructions: 'You are the front desk.',
  tools: [sendNote],
  trust: [sendNote],
  access: 'signedIn',
  handsOver: [billing, staffDesk],
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
})

export const asker = agent('asker', {
  about: 'Asks before it answers',
  model: writer,
  instructions: 'Ask what you need to know.',
  tools: [],
  access: 'signedIn',
  questions: true,
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
})
