import { agent, model, secret } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const helper = agent('helper', { about: 'Helps', model: writer, instructions: 'You help.', tools: [], access: 'signedIn', limits: { steps: 12, perRun: { tokensOut: 50000 } } })
