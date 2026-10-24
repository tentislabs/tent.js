import { change, emit, event, flow, input, object, query, text } from 'tentjs'
import { marks } from './tables.ts'

// The event is declared in this file alone: the tests of the engine describe every export of it as a definition.
const orderShipped = event('order.shipped', { data: object({ order: text(), carrier: text() }) })

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

export const shipFits = change('shipFits', {
  access: 'nobody',
  input: { order: text() },
  run: ({ input }) => {
    emit(orderShipped, { order: input.order, carrier: 'post' })
  },
})

// Code that the type checker would refuse, as a file that is not checked may hold it.
export const shipUnfit = change('shipUnfit', {
  access: 'nobody',
  input: { order: text() },
  run: () => {
    emit(orderShipped, { order: 5, carrier: 'post' })
  },
})

export const noted = flow('noted', {
  on: orderShipped,
  run: async ({ event, step }) => {
    await step('note', () => addMark({ what: `${event.data.order} by ${event.data.carrier}` }))
  },
})
