import { agent, flow, model, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-4-5' })

// A flow that the pages may call, and that states no `input`.
export const welcome = flow('welcome', {
  access: 'signedIn',
  as: 'starter',
  run: async ({ step }) => step('greet', () => 'hello'),
})

// A flow that is offered to an outside door, and states neither `about` nor `output`.
export const report = flow('report', {
  access: 'signedIn',
  as: 'starter',
  offer: ['api'],
  input: { month: text() },
  run: async ({ input, step }) => step('add up', () => input.month),
})

// A flow that an agent uses as a tool, and that tells a model nothing of itself.
export const tidy = flow('tidy', { as: 'starter', run: async ({ step }) => step('work', () => 1) })

export const helper = agent('helper', {
  model: writer,
  instructions: 'Answer questions about the orders.',
  tools: [tidy],
  limits: { steps: 4, perRun: { tokensOut: 10_000 } },
})
