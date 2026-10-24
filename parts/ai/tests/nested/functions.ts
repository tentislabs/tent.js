import { agent, flow, list, model, number, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const tally = flow('tally', {
  about: 'Adds one to a number',
  access: 'signedIn',
  as: 'starter',
  input: { n: number() },
  output: number(),
  run: async ({ input, step }) => step('add', () => input.n + 1),
})

const limits = { steps: 6, perRun: { calls: 100 } }

export const inner = agent('inner', {
  about: 'Answers from inside',
  model: writer,
  instructions: 'You answer.',
  tools: [tally],
  access: 'signedIn',
  limits,
})

export const outer = agent('outer', {
  model: writer,
  instructions: 'You ask others.',
  tools: [tally, inner],
  access: 'signedIn',
  limits,
})

export const capped = agent('capped', {
  model: writer,
  instructions: 'You ask others.',
  tools: [inner],
  access: 'signedIn',
  limits: { steps: 6, perRun: { calls: 2 } },
})

export const fourth = agent('fourth', {
  about: 'The fourth level',
  model: writer,
  instructions: 'You answer.',
  tools: [],
  access: 'signedIn',
  limits,
})

export const third = agent('third', {
  about: 'The third level',
  model: writer,
  instructions: 'You ask the fourth.',
  tools: [fourth],
  access: 'signedIn',
  limits,
})

export const second = agent('second', {
  about: 'The second level',
  model: writer,
  instructions: 'You ask the third.',
  tools: [third],
  access: 'signedIn',
  limits,
})

export const first = agent('first', {
  model: writer,
  instructions: 'You ask the second.',
  tools: [second],
  access: 'signedIn',
  limits,
})
