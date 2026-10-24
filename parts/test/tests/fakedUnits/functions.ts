import { agent, json, judge, list, model, number, object, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// What the engine counted, which the test reads as the system.
export const usage = table('usage', { shows: 'counts', access: { read: 'owner' } })

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// A model that is a function: it decides whether a text may pass.
export const gate = model('gate', {
  provider: 'decisions',
  name: 'gate-1',
  input: { task: json(), answer: json(), rule: text() },
  output: object({ score: number(), why: text() }),
})

export const desk = agent('desk', {
  about: 'Answers at the desk',
  model: writer,
  instructions: 'Answer kindly.',
  tools: [],
  access: 'signedIn',
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
  guards: { in: [judge(gate, 'Holds no forbidden words')], refused: 'Not here.' },
})
