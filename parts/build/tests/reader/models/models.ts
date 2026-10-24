import { get, model, object, post, secret, service, text } from 'tentjs'

export const decisions = service('decisions', {
  url: 'https://decisions.example',
  auth: { bearer: secret('DECISIONS_KEY') },
  calls: {
    paint: post('/v1/paint', { input: { prompt: text() }, output: object({ id: text() }) }),
    status: get('/v1/jobs/{job}', { input: { job: text() }, output: object({ status: text() }) }),
  },
})

export const painter = model('painter', {
  provider: 'service',
  name: 'painter-1',
  call: decisions.paint,
  units: { images: 1 },
  job: { check: decisions.status, with: { job: 'id' }, done: { status: 'succeeded' }, failed: { status: 'failed' } },
  limits: { time: '10 minutes' },
})
