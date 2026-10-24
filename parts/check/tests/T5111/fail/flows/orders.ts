import { change, emit, text } from 'tentjs'

// One event, emitted with two shapes of data, and declared nowhere.
export const ship = change('ship', {
  access: 'signedIn',
  input: { order: text() },
  run: ({ input }) => {
    emit('order.shipped', { order: input.order })
  },
})

export const shipBy = change('shipBy', {
  access: 'signedIn',
  input: { order: text(), carrier: text() },
  run: ({ input }) => {
    emit('order.shipped', { order: input.order, carrier: input.carrier })
  },
})
