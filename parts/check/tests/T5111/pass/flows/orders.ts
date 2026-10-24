import { change, emit, event, object, text } from 'tentjs'

// An event that is declared says its shape: the type checker holds each emit of it.
export const orderSent = event('order.sent', { data: object({ order: text(), carrier: text({ optional: true }) }) })

// One event emitted with one shape, twice, in either order of its fields.
export const ship = change('ship', {
  access: 'signedIn',
  input: { order: text(), carrier: text() },
  run: ({ input }) => {
    emit('order.shipped', { order: input.order, carrier: input.carrier })
    emit('order.sent', { order: input.order })
  },
})

export const shipAgain = change('shipAgain', {
  access: 'signedIn',
  input: { order: text(), carrier: text() },
  run: ({ input }) => {
    emit('order.shipped', { carrier: input.carrier, order: input.order })
    emit('order.sent', { order: input.order, carrier: input.carrier })
  },
})
