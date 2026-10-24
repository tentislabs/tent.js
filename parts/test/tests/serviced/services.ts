import { file, get, number, object, post, secret, service, text } from 'tentjs'

// Each address of this file is written anew by the test, with the port of its stand-in server.
export const remote = service('remote', {
  url: 'http://127.0.0.1:1',
  auth: { bearer: secret('REMOTE_KEY') },
  onceOnlyHeader: 'Idempotency-Key',
  calls: {
    look: get('/look', { input: {} }),
    pay: post('/pay', { input: { n: number() } }),
    chart: get('/chart', { input: {}, output: file() }),
    send: post('/up', { input: { doc: file() }, body: 'files' }),
    shaped: get('/shaped', { input: {}, output: object({ id: text() }) }),
  },
})

export const counted = service('counted', {
  url: 'http://127.0.0.1:1',
  auth: { header: { name: 'X-Counted-Key', value: secret('COUNTED_KEY') } },
  limits: { perMinute: 1 },
  calls: { look: get('/counted', { input: {} }), pay: post('/counted', { input: {} }) },
})

export const signed = service('signed', {
  url: 'http://127.0.0.1:1',
  auth: { by: 'signed' },
  onceOnlyHeader: 'Idempotency-Key',
  calls: { pay: post('/signed', { input: { n: number() } }) },
})
