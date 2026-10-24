import { get, object, post, secret, service, text } from 'tentjs'

export const hooks = service('hooks', {
  url: 'https://hooks.example.com',
  webhook: { scheme: 'standard', secret: secret('HOOK') },
  calls: {
    decide: post('/decide', { input: { state: text() }, output: object({ answer: text() }) }),
    status: get('/status', { input: { id: text() } }),
  },
})

export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  auth: { bearer: secret('STRIPE_KEY') },
  headers: { 'Stripe-Version': '2026-06-30' },
  calls: {
    createRefund: post('/v1/refunds', {
      input: { charge: text() },
      output: object({ id: text() }),
      body: 'form',
      sends: true,
      changes: true,
      about: 'Refunds a charge',
    }),
  },
  from: './stripe.openapi.json',
  use: ['PostRefunds'],
  limits: { perSecond: 20, perMinute: 600, atOnce: 4, size: '10 MB', error: '16 KB', redirects: 3, time: '20 seconds' },
  tries: { max: 3, wait: '30 seconds', on: [409], first: '1 second' },
  onceOnlyHeader: 'Idempotency-Key',
  webhook: { scheme: 'stripe', secret: secret('STRIPE_HOOK') },
  connection: 'hooks',
  mcp: false,
  was: 'payments',
})
