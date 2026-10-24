import { action, agent, list, model, query, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const lookUp = query('lookUp', {
  about: 'Looks a word up',
  access: 'signedIn',
  input: { word: text() },
  rows: notes.where({}),
})

export const payNow = action('payNow', {
  about: 'Pays after a yes',
  access: 'signedIn',
  input: {},
  danger: 'ask',
  output: text(),
  run: async () => 'paid',
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [lookUp],
  access: 'signedIn',
  limits: { steps: 2, perRun: { calls: 3 } },
})

export const counted = agent('counted', {
  model: writer,
  instructions: 'You help.',
  tools: [lookUp],
  access: 'signedIn',
  limits: { steps: 20, perRun: { calls: 3 } },
})

export const polite = agent('polite', {
  model: writer,
  instructions: 'You help.',
  tools: [payNow],
  access: 'signedIn',
  words: { refused: 'The person said no, kindly.' },
  limits: { steps: 4, perRun: { calls: 10 } },
})

// An agent that the builder's own driver runs, made in engine.ts.
export const custom = agent('custom', {
  model: writer,
  instructions: 'You help.',
  tools: [lookUp],
  access: 'signedIn',
  driver: 'mine',
  limits: { steps: 4, perRun: { calls: 10 } },
})
