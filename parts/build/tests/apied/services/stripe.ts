import { object, post, secret, service, text } from 'tentjs'

export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  auth: { bearer: secret('STRIPE_KEY') },
  calls: {
    createRefund: post('/v1/refunds', { input: { charge: text() }, output: object({ id: text() }), body: 'form' }),
  },
  from: './stripe.openapi.json',
  use: ['PostRefunds', 'GetChargesCharge'],
})
