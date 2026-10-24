import { model, secret, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// A model of a provider that `engine.ts` makes: it writes, gives typed answers and reasoning.
export const local = model('local', {
  provider: 'mine',
  name: 'mine-1',
  abilities: ['reply', 'typedAnswers', 'reasoning'],
  takes: 8000,
  limits: { perDay: { calls: 100 } },
})

// A model whose server never answers.
export const broken = model('broken', { provider: 'down', name: 'down-1', abilities: ['reply'], takes: 8000 })

export const painter = model('painter', { provider: 'mine', name: 'p-1', input: { prompt: text() }, output: text() })
