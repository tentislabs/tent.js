import { agent, model, secret } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [],
  limits: { steps: 12, perRun: { tokensOut: 50000, calls: 20, workSeconds: 60 } },
})

export const noSteps = agent('noSteps', {
  model: writer,
  instructions: 'You help.',
  tools: [],
  limits: { perRun: { tokensOut: 50000 } },
})

export const unlimited = agent('unlimited', {
  model: writer,
  instructions: 'You help.',
  tools: [],
})
