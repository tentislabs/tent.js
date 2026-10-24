import { action, anyone, agent, change, flow, input, list, model, text } from 'tentjs'
import { orders, teams, users } from './tables.ts'

const open = anyone('a test calls it')

export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

export const addOrder = change('addOrder', {
  access: open,
  input: { team: text(), title: text() },
  set: orders.of(input('team')).add({ title: input('title') }),
})

// Started by each order of a team: it lives in the file of that team, and waits for a yes there.
export const onOrder = flow('onOrder', {
  on: orders.added(),
  run: async ({ step }) => {
    await step.waitFor('go on')
  },
})

export const refund = action('refund', {
  about: 'Gives the money back',
  access: open,
  input: { order: text() },
  output: text(),
  danger: 'ask',
  run: async ({ input: given }) => `refunded ${given.order}`,
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [refund],
  access: open,
  limits: { steps: 4, perRun: { calls: 20 } },
})
