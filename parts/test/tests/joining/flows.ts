import { agent, event, flow, model, object, secret, text } from 'tentjs'
import { addMark } from './functions.ts'

// One run for each order, whoever starts it and at whichever door: it waits an hour, and then answers. Its key
// makes it code, so it says that it sends nothing out, and a model may call it with nobody asked.
export const handle = flow('handle', {
  about: 'Handles one order, once however often it is asked',
  access: 'signedIn',
  sends: false,
  offer: ['mcp', 'api'],
  as: 'starter',
  input: { order: text() },
  output: object({ handled: text() }),
  key: ({ input }) => input.order,
  together: { then: 'join' },
  run: async ({ input, step }) => {
    await step.wait('1 hour')
    return step('handle', () => ({ handled: input.order }))
  },
})

export const writer = model('writer', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
})

const limits = { steps: 4, perRun: { calls: 10 } }

// An agent whose one tool is the flow of one run for each order.
export const desk = agent('desk', {
  about: 'Answers at the desk',
  model: writer,
  instructions: 'You help.',
  tools: [handle],
  access: 'signedIn',
  limits,
})

// An agent that one run an hour may start: every other start is dropped.
export const once = agent('once', {
  about: 'Answers once an hour',
  model: writer,
  instructions: 'You help.',
  tools: [],
  access: 'signedIn',
  limits,
  pace: { drop: { max: 1, per: '1 hour' } },
})

// An agent whose stop is followed by work of its own. Its run waits for the flow its tool starts.
export const careful = agent('careful', {
  about: 'Answers with care',
  model: writer,
  instructions: 'You help.',
  tools: [handle],
  access: 'signedIn',
  limits,
  onStop: async ({ step }) => {
    await step('note', () => addMark({ what: 'careful stopped' }))
  },
})

// Hears the end of each run that failed or was stopped, so a test sees that the runs of agents are told too.
export const heard = flow('heard', {
  on: [event('run.failed'), event('run.stopped')],
  run: async ({ event, step }) => {
    await step('note', () => addMark({ what: `${event.name} ${event.data.flow}` }))
  },
})
