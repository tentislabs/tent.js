import { agent, model } from 'tentjs'

// A model whose provider the project makes in engine.ts, and an agent that the command line offers.
export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply'], takes: 100000 })

export const helper = agent('helper', {
  about: 'Answers what it is told',
  model: writer,
  instructions: 'You answer.',
  tools: [],
  access: 'anyone',
  offer: ['cli'],
  limits: { steps: 4, perRun: { calls: 10 } },
})
