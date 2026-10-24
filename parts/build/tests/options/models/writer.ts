import { file, model, object, secret, text } from 'tentjs'
import { hooks } from '../services/hooks'

export const embedder = model('embedder', { provider: 'openai', name: 'text-embedding-3-small' })

export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
  url: 'https://models.example.com',
  abilities: ['reply', 'tools'],
  takes: 200000,
  voices: ['calm'],
  input: { prompt: text() },
  output: object({ picture: file() }),
  limits: { perDay: { tokensOut: 1000000 }, perCallerPerDay: { tokensOut: 100000 }, time: '60 seconds' },
  tries: { max: 2, wait: '5 seconds' },
  fallback: [embedder],
  options: { temperature: 0 },
  countBy: 'app',
  call: hooks.decide,
  units: { tokensIn: 'usage.input_tokens' },
  job: { check: hooks.status, with: { id: 'id' }, done: { status: 'succeeded' }, failed: { status: 'failed' }, every: '5 seconds' },
  was: 'author',
})
