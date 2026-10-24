import { flow, model, number, secret, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const judgeIt = flow('judgeIt', { input: { words: text() }, run: async ({ input, step }) => step('judge', () => writer.fill({ score: number() }, input.words)) })
