import { action, agent, change, choice, connections, json, link, list, model, secret, table, text } from 'tentjs'
import { board, cloud, local, notes, team, wiki } from './services'

export const users = table('users', { columns: { name: text(), roles: list(text()) } })

// A model that takes no pictures, and one that does.
export const writer = model('writer', {
  provider: 'openai',
  name: 'gpt-4.1',
  key: secret('OPENAI_KEY'),
  abilities: ['reply', 'tools'],
})
export const seer = model('seer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const helper = agent('helper', {
  about: 'Works with the board, the notes, the cloud and the local tools',
  model: writer,
  instructions: 'Use the tools.',
  tools: [board, notes, local, cloud, wiki],
  trust: [board, notes, local, cloud, wiki],
  access: 'signedIn',
  limits: { steps: 6, perRun: { tokensOut: 20000 }, result: '64 KB' },
})

export const looker = agent('looker', {
  about: 'Looks at the pictures of the board',
  model: seer,
  instructions: 'Look at the pictures.',
  tools: [board],
  trust: [board],
  access: 'signedIn',
  limits: { steps: 6, perRun: { tokensOut: 20000 } },
})

// A conversation kept in a table of the project, for an agent that looks at pictures and remembers.
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
export const newChat = change('newChat', { access: 'signedIn', input: {}, set: chats.add({ title: 'A chat' }) })
export const rememberer = agent('rememberer', {
  about: 'Looks at the pictures of the board, and remembers them',
  model: seer,
  instructions: 'Look at the pictures.',
  tools: [board],
  trust: [board],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 6, perRun: { tokensOut: 20000 } },
})

// The starts of a connect to each server whose documents say where it signs people in.
export const connectWiki = action('connectWiki', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => connections.start(wiki, { back: '/done' }),
})
export const connectTeam = action('connectTeam', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => connections.start(team, { back: '/done' }),
})

// A tool of the board called from code, as a service call.
export const renameIt = action('renameIt', {
  access: 'signedIn',
  input: {},
  run: () => board.renameBoard({}),
})
