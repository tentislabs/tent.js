import { agent, choice, json, judge, list, model, number, object, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// What the engine counted, which the test reads as the system, and the scores of the runs of each person.
export const usage = table('usage', { shows: 'counts', access: { read: 'owner' } })
export const ratings = table('ratings', { shows: 'scores', access: { read: 'owner' } })

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// A model that decides whether a text may pass: no language model, declared with its own input and output, as a judge is handed and answers.
export const gate = model('gate', {
  provider: 'decisions',
  name: 'gate-1',
  input: { task: json(), answer: json(), rule: text() },
  output: object({ score: number(), why: text() }),
})

// A model that scores an answer, as a judge.
export const scorer = model('scorer', {
  provider: 'decisions',
  name: 'score-1',
  input: { task: json(), answer: json(), rule: text() },
  output: object({ score: number(), why: text() }),
})

// A model that sorts a message, as a tool.
export const sorter = model('sorter', {
  provider: 'decisions',
  name: 'sort-1',
  input: { message: text() },
  output: object({ kind: choice(['question', 'refund']) }),
})

export const desk = agent('desk', {
  about: 'Answers at the desk',
  model: writer,
  instructions: 'Answer kindly.',
  tools: [{ tool: sorter, about: 'Sorts a message into a question or a refund' }],
  access: 'signedIn',
  guards: { in: [judge(gate, 'Holds no forbidden words')], refused: 'Not here.' },
  score: { share: 1, with: judge(scorer, 'Answers kindly') },
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
})
