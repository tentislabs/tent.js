import { action, agent, flow, get, json, list, model, object, post, secret, service, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

const decision = { input: { state: json(), questions: json() }, output: object({ answers: json() }) }

export const decisions = service('decisions', {
  url: 'https://decisions.example',
  auth: { bearer: secret('DECISIONS_KEY') },
  calls: {
    decide: post('/v1/decide', decision),
    decideAgain: post('/v2/decide', decision),
    paint: post('/v1/paint', { input: { prompt: text() }, output: object({ id: text() }) }),
    status: get('/v1/jobs/{job}', {
      input: { job: text() },
      output: object({ status: text(), picture: text({ optional: true }) }),
    }),
    look: post('/v1/look', { ...decision, sends: false }),
  },
})

export const spare = model('spare', { provider: 'service', name: 'spare-1', call: decisions.decideAgain })

export const decider = model('decider', {
  provider: 'service',
  name: 'decider-1',
  call: decisions.decide,
  units: { tokensIn: 'usage.input_tokens', images: 1 },
  limits: { perDay: { tokensIn: 10 } },
  tries: { max: 2, wait: '1 second' },
  fallback: [spare],
})

export const looker = model('looker', { provider: 'service', name: 'looker-1', call: decisions.look })

export const painter = model('painter', {
  provider: 'service',
  name: 'painter-1',
  call: decisions.paint,
  job: {
    check: decisions.status,
    with: { job: 'id' },
    done: { status: 'succeeded' },
    failed: { status: { in: ['failed', 'canceled'] } },
    every: '1 second',
  },
  limits: { time: '10 minutes' },
})

const asked = { state: { order: 1 }, questions: { refund: { type: 'yes-no', instructions: 'Money back?' } } }

export const decide = action('decide', {
  about: 'Decides whether the person wants money back',
  access: 'signedIn',
  input: {},
  output: json(),
  sends: false,
  run: async () => decider(asked),
})

export const look = action('look', {
  about: 'Looks at the order',
  access: 'signedIn',
  input: {},
  output: json(),
  sends: false,
  run: async () => looker(asked),
})

export const paint = action('paint', {
  about: 'Paints a picture',
  access: 'signedIn',
  input: { prompt: text() },
  output: json(),
  sends: false,
  run: async ({ input }) => painter({ prompt: input.prompt }),
})

export const paintIt = flow('paintIt', {
  input: { prompt: text() },
  output: json(),
  run: async ({ input, step }) => step('paint', () => painter({ prompt: input.prompt })),
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [decide, look, paint],
  access: 'signedIn',
  limits: { steps: 6, perRun: { calls: 100 } },
})
