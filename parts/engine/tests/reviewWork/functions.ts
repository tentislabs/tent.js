import { agent, change, flow, input, list, model, text } from 'tentjs'
import { users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const thinker = model('thinker', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

// A flow tool that states it sends nothing, and whose step fetches on a worker: under a tool call that nobody
// agreed to the fetch is refused, and the person is asked.
export const fetchTool = flow('fetchTool', {
  about: 'Fetches a page',
  access: 'signedIn',
  as: 'starter',
  input: {},
  output: text(),
  sends: false,
  run: async ({ step }) =>
    step('fetch', async () => (await fetch('data:text/plain,fetched')).text(), { worker: 'gpu', time: '1 minute' }),
})

export const helper = agent('helper', {
  model: thinker,
  instructions: 'You fetch.',
  tools: [fetchTool],
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 20 } },
})
