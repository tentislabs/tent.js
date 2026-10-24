import { file, model, object, secret, text } from 'tentjs'

export const backup = model('backup', { provider: 'openai', name: 'gpt-5-mini', key: secret('OPENAI_KEY') })

export const writer = model('writer', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
  fallback: [backup],
})

// A model of a provider that the project makes in `engine.ts`.
export const own = model('own', { provider: 'mine', name: 'mine-1', abilities: ['reply'], takes: 10000 })

// Any other kind of AI: it states what it takes and what it gives, and its provider is made in `engine.ts`.
export const painter = model('painter', {
  provider: 'pictures',
  name: 'flux-pro',
  input: { prompt: text(), photo: file({ optional: true }) },
  output: object({ picture: file(), said: text() }),
})
