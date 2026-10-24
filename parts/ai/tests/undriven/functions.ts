import { agent, list, model, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// An agent that names a driver that nobody made.
export const lost = agent('lost', {
  model: writer,
  instructions: 'You help.',
  tools: [],
  access: 'signedIn',
  driver: 'nobodys',
  limits: { steps: 4, perRun: { calls: 10 } },
})
