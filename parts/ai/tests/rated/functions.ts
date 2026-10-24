import { action, agent, choice, json, judge, link, list, model, query, runs, secret, table, text } from 'tentjs'

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

// The ratings that people gave and the scores that a judge gave, as the engine keeps them: each person reads their own.
export const ratings = table('ratings', { shows: 'scores', access: { read: 'owner' } })

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const stock = query('stock', {
  about: 'What is in stock',
  access: 'signedIn',
  input: {},
  rows: chats.where({}),
})

export const helper = agent('helper', {
  about: 'Answers of the shop',
  model: writer,
  instructions: 'Answer of the shop.',
  tools: [stock],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat' },
  score: { share: 1, with: judge(writer, 'Answers kindly') },
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
})

export const quiet = agent('quiet', {
  about: 'Answers, and is never scored',
  model: writer,
  instructions: 'Answer briefly.',
  tools: [],
  access: 'signedIn',
  score: { share: 0, with: judge(writer, 'Answers kindly') },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

// A rating that the app keeps for a person, from a mail they answered: backend code, which names the run.
export const rateByMail = action('rateByMail', {
  access: 'signedIn',
  system: 'it rates a run that a mail names',
  input: { run: text(), score: text() },
  run: async ({ input }) => runs.rate(input.run, { score: Number(input.score), note: 'by mail' }),
})
