import { action, agent, json, model, secret } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const look = action('look', { about: 'Looks', access: 'signedIn', input: {}, output: json(), sends: false, run: async () => ({ seen: true }) })

export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [look], limits: { steps: 12, perRun: { tokensOut: 50000 } } })
