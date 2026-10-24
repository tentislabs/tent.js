import { agent, model, secret } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const second = agent('second', { about: 'The second', model: writer, instructions: 'You help.', tools: [], limits: { steps: 12, perRun: { tokensOut: 50000 } } })

export const first = agent('first', { model: writer, instructions: 'You help.', tools: [second], limits: { steps: 12, perRun: { tokensOut: 50000 } } })
