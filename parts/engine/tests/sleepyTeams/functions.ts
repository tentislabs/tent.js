import { anyone, change, flow, input, query, text } from 'tentjs'
import { orders, teams } from './tables.ts'

const open = anyone('a test calls it')

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

export const listOrders = query('listOrders', {
  access: open,
  input: { team: text() },
  rows: orders.of(input('team')).oldest('createdAt'),
})

// Started by each order of a team: it lives in the file of that team, waits an hour, and adds an order there.
export const onOrder = flow('onOrder', {
  on: orders.added({ where: { title: 'first' } }),
  run: async ({ event, step }) => {
    await step.wait('1 hour')
    await step('again', () => addOrder({ team: String(event.row.team), title: 'after the wait' }))
  },
})
