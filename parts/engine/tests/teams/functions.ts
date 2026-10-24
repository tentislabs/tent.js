import { anyone, change, input, query, text } from 'tentjs'
import { orders, stamps, teams } from './tables.ts'

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

// Two ways to read a table whose read rule is code that reads the clock.

export const stampsByRows = query('stampsByRows', {
  access: open,
  rows: stamps.sort('label'),
})

export const stampsByRun = query('stampsByRun', {
  access: open,
  run: ({ db }) => {
    return db.stamps.all().length
  },
})

export const addStamp = change('addStamp', {
  access: open,
  input: { label: text() },
  set: stamps.add({ label: input('label') }),
})
