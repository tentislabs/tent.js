import { agent, change, flow, input, list, model, text } from 'tentjs'
import { users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const thinker = model('thinker', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

// How many times the step below came past its fetch, on the machine that carries it out.
let fetched = 0

// A flow tool whose step fetches on a worker and fails once after its first fetch: the try after it is handed what
// the agreed fetch answered, and fetches nothing again.
export const fetchTool = flow('fetchTool', {
  about: 'Fetches a page',
  access: 'signedIn',
  as: 'starter',
  input: {},
  output: text(),
  sends: false,
  run: async ({ step }) =>
    step(
      'fetch',
      async () => {
        const text = await (await fetch('data:text/plain,fetched')).text()
        fetched += 1
        if (fetched === 1) throw new Error('the first try fails after its fetch')
        return text
      },
      { worker: 'gpu', time: '1 minute', tries: { max: 3, wait: '1 second' } },
    ),
})

export const helper = agent('helper', {
  model: thinker,
  instructions: 'You fetch.',
  tools: [fetchTool],
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 20 } },
})
