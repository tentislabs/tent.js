import { action, agent, model, secret, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const look = action('look', { about: 'Looks', access: 'signedIn', input: {}, output: text(), sends: false, run: async () => 'seen' })

export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [look], limits: { steps: 12, perRun: { tokensOut: 50000 } } })
