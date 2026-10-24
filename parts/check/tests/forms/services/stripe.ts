import { object, post, secret, service, text } from 'tentjs'

export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  auth: { bearer: secret('STRIPE_KEY') },      // or header, basic, query, oauth, by
  calls: {
    createRefund: post('/v1/refunds', { input: { charge: text() }, output: object({ id: text() }) }),
  },
  // or:  from: './stripe.openapi.json', use: ['PostRefunds'],
  limits: { perSecond: 20, time: '20 seconds' },
  tries: 3,
  onceOnlyHeader: 'Idempotency-Key',
})
