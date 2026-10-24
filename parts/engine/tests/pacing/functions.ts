import { change, flow, input, query, text } from 'tentjs'
import { marks, orders } from './tables.ts'

export const addOrder = change('addOrder', {
  access: 'nobody',
  input: { name: text() },
  set: orders.add({ name: input('name') }),
})

export const renameOrder = change('renameOrder', {
  access: 'nobody',
  input: { order: text(), name: text() },
  run: ({ input, db }) => {
    db.orders.change(input.order, { name: input.name })
  },
})

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

// A change of an order is noted once it has been quiet for half a minute: one run for each order.
export const noted = flow('noted', {
  on: orders.changed(),
  pace: { debounce: '30 seconds' },
  run: async ({ event, step }) => {
    await step('note', () => addMark({ what: `noted ${event.row.name}` }))
  },
})
