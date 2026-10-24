import { action, agent, change, input, list, model, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { words: text() },
  set: notes.add({ words: input('words') }),
})

// A tool that says whose rights it runs with.
export const whoAmI = action('whoAmI', {
  about: 'Says who calls',
  access: 'anyone',
  input: {},
  output: text(),
  sends: false,
  run: async ({ user }) => (user ? `user ${user.id}` : 'no user'),
})

const limits = { steps: 4, perRun: { calls: 10 } }

export const asMe = agent('asMe', {
  model: writer,
  instructions: 'You help.',
  tools: [whoAmI],
  access: 'signedIn',
  limits,
})

// An agent that a trigger starts: it runs as the system.
export const onNote = agent('onNote', {
  model: writer,
  instructions: 'You read notes.',
  tools: [whoAmI],
  on: notes.added(),
  limits,
})
