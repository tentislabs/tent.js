import { model, object, post, service, text } from 'tentjs'

export const decisions = service('decisions', {
  url: 'https://api.example.com',
  calls: { decide: post('/v1/decide', { input: { state: text() }, output: object({ answer: text() }) }) },
})

export const empty = model('empty', { provider: 'anthropic', name: 'claude-sonnet-5-5', limits: { perDay: {} } })

export const unknown = model('unknown', { provider: 'openai', name: 'gpt-5', limits: { perDay: { pictures: 5 } } })

export const engines = model('engines', {
  provider: 'service',
  name: 'decider-1',
  call: decisions.decide,
  units: { bytesOut: 'usage.bytes' },
})

export const whole = model('whole', {
  provider: 'google',
  name: 'gemini-3-pro',
  countBy: 'app',
  limits: { perCallerPerDay: { calls: 10 } },
})
