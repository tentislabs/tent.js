import { model, object, post, service, text } from 'tentjs'

export const decisions = service('decisions', {
  url: 'https://api.example.com',
  calls: { decide: post('/v1/decide', { input: { state: text() }, output: object({ answer: text() }) }) },
})

export const writer = model('writer', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  limits: { perDay: { tokensOut: 2000000 }, perCallerPerDay: { calls: 100 } },
})

export const decider = model('decider', {
  provider: 'service',
  name: 'decider-1',
  call: decisions.decide,
  units: { decisions: 1 },
  limits: { perDay: { decisions: 500 } },
})

// A provider of the builder's own may report any unit, so a limit on one of its own is no finding.
export const painter = model('painter', {
  provider: 'pictures',
  name: 'flux-pro',
  input: { prompt: text() },
  output: object({ picture: text() }),
  limits: { perDay: { images: 500 } },
})
