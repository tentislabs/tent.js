import { agent, change, flow, input, list, model, text } from 'tentjs'
import { users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const thinker = model('thinker', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

// A flow tool whose step on a worker fetches twice, each fetch made by the writer: under a tool call that nobody
// agreed to, each is refused at its own place, and the person is asked about each.
export const fetchTool = flow('fetchTool', {
  about: 'Fetches two pages',
  access: 'signedIn',
  as: 'starter',
  input: {},
  output: text(),
  sends: false,
  run: async ({ step }) =>
    step(
      'fetch',
      async () => {
        const first = await (await fetch('data:text/plain,one')).text()
        const second = await (await fetch('data:text/plain,two')).text()
        return `${first} ${second}`
      },
      { worker: 'gpu', time: '1 minute' },
    ),
})

export const helper = agent('helper', {
  model: thinker,
  instructions: 'You fetch.',
  tools: [fetchTool],
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 20 } },
})
