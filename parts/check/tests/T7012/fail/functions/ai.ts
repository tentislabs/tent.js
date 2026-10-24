import { agent, flow, model, secret, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const tidy = flow('tidy', { about: 'Tidies', input: { words: text({ optional: true }) }, output: text(), run: async ({ step }) => step('tidy', () => 'tidied') })

export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [tidy], limits: { steps: 12, perRun: { tokensOut: 50000 } } })
