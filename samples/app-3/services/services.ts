import { get, number, object, post, secret, service, text } from 'tentjs'

export const mailService = service('mailService', {
  url: 'https://mail.example.com',
  auth: { bearer: secret('MAIL_KEY') },
  webhook: { scheme: 'standard', secret: secret('MAIL_HOOK') },
  calls: {
    send: post('/v1/send', {
      about: 'Sends the answer of a ticket to the customer',
      input: { to: text(), subject: text(), text: text() },
      output: object({ id: text() }),
    }),
  },
})

export const payments = service('payments', {
  url: 'https://payments.example.com',
  auth: { bearer: secret('PAYMENTS_KEY') },
  onceOnlyHeader: 'Idempotency-Key',
  calls: {
    getOrder: get('/v1/orders/{id}', {
      about: 'Reads one order',
      input: { id: text() },
      output: object({ id: text(), total: number(), currency: text(), status: text(), email: text() }),
      sends: false,
      changes: false,
    }),
    refundOrder: post('/v1/orders/{id}/refund', {
      about: 'Refunds one order in full',
      input: { id: text() },
      output: object({ id: text(), status: text() }),
    }),
  },
})
