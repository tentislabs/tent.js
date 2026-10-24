import { agent, flow, model, number, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-4-5' })

// A flow that the pages may call states its `input`.
export const welcome = flow('welcome', {
  access: 'signedIn',
  as: 'starter',
  input: { name: text() },
  run: async ({ input, step }) => step('greet', () => input.name),
})

// A flow that the pages may call and that takes nothing states `input: {}`.
export const ping = flow('ping', {
  access: 'signedIn',
  as: 'starter',
  input: {},
  run: async ({ step }) => step('ping', () => 'pong'),
})

// A flow that is offered to an outside door says what a caller must know of it.
export const report = flow('report', {
  access: 'signedIn',
  as: 'starter',
  offer: ['api'],
  about: 'Adds up the orders of one month.',
  input: { month: text() },
  output: text(),
  run: async ({ input, step }) => step('add up', () => input.month),
})

// A flow that nothing offers and no agent uses needs none of it.
export const sweep = flow('sweep', { run: async ({ step }) => step('work', () => 1) })

// A flow that an agent uses as a tool says what it is for, what it takes and what it answers.
export const tidy = flow('tidy', {
  as: 'starter',
  about: 'Tidies the orders, and answers how many it tidied.',
  input: { older: text() },
  output: number(),
  run: async ({ step }) => step('work', () => 1),
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'Answer questions about the orders.',
  tools: [tidy],
  limits: { steps: 4, perRun: { tokensOut: 10_000 } },
})
