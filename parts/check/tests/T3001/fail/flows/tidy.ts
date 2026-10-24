import { agent, flow, model, number, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-4-5' })

export const tidy = flow('tidy', {
  about: 'Tidies the notes, and answers how many it tidied.',
  input: { older: text() },
  output: number(),
  offer: ['api'],
  run: async ({ step }) => step('count', () => 0),
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'Answer questions about the notes.',
  tools: [],
  limits: { steps: 4, perRun: { tokensOut: 10_000 } },
  about: 'Answers questions about the notes.',
  offer: ['mcp'],
})
