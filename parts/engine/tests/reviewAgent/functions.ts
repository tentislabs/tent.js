import { allow, agent, model } from 'tentjs'

export const writer = model('writer', { provider: 'openai', name: 'gpt-5', abilities: ['reply', 'tools'] })

// An agent whose rule lets nobody in: its arrow is code, as every arrow of a project the tests bundle is.
export const gated = agent('gated', {
  about: 'Lets nobody in',
  model: writer,
  instructions: 'You help.',
  tools: [],
  access: allow(() => false),
  limits: { steps: 4, perRun: { calls: 10 } },
})
