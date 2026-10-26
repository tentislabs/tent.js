import { action, flow, json, model, post, service, start, text } from 'tentjs'

export const pay = service('pay', {
  url: 'https://pay.example',
  calls: { charge: post('/charge', { input: { order: text() } }) },
})

// A model of a provider that `engine.ts` makes, which answers wherever it is reached.
export const painter = model('painter', { provider: 'mine', name: 'p-1', input: { prompt: text() }, output: text() })

export const charge = action('charge', {
  access: 'signedIn',
  input: { order: text() },
  output: json(),
  run: async ({ input }) => pay.charge({ order: input.order }),
})

export const paint = action('paint', {
  access: 'signedIn',
  input: { prompt: text() },
  output: text(),
  run: async ({ input }) => String(await painter({ prompt: input.prompt })),
})

export const fetchOut = action('fetchOut', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => (await fetch('http://127.0.0.1:9/')).statusText,
})

// A run that waits for a person to approve it, and says what the person answered.
export const approval = flow('approval', {
  input: {},
  run: async ({ step }) => {
    const said = await step.waitFor('approval')
    return 'approved' in said && said.approved ? 'approved' : 'refused'
  },
})

export const askPerson = action('askPerson', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => {
    const started = await start(approval, {})
    return String(started.run)
  },
})
