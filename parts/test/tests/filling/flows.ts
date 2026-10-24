import { flow } from 'tentjs'
import { noted } from './helpers/seen.ts'
import { orders } from './tables.ts'

// A flow on any change of an order, which a fill does not start, and one on a change of its summary, which it does.
export const onAnyChange = flow('onAnyChange', {
  on: orders.changed(),
  run: async ({ event }) => {
    await noted('onAnyChange', Object(event).columns)
  },
})

export const onSummary = flow('onSummary', {
  on: orders.changed({ columns: ['summary'] }),
  run: async ({ event }) => {
    await noted('onSummary', Object(event).columns)
  },
})
