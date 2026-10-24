import { change, emit, event, flow, input, object, table, text } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn' } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

// An event that is declared with the shape of its data.
export const orderShipped = event('order.shipped', { data: object({ order: text(), carrier: text() }) })

// Four mistakes that the types show: data of the wrong type by the declaration and by the name, and a field that
// the data does not have, read in a flow that the event starts and in one that waits for it.
export const ship = change('ship', {
  access: 'signedIn',
  input: { order: text() },
  run: ({ input }) => {
    emit(orderShipped, { order: input.order, carrier: 'post' })
    emit(orderShipped, { order: 5, carrier: 'post' })
    emit('order.shipped', { order: input.order })
  },
})

export const noted = flow('noted', {
  on: orderShipped,
  run: async ({ event, step }) => {
    await step('good', () => addOrder({ title: event.data.order }))
    const missing = event.data.nothere
    return missing
  },
})

export const waited = flow('waited', {
  run: async ({ step }) => {
    const shipped = await step.waitFor(orderShipped)
    const carrier: string | undefined = shipped.data?.carrier
    const missing = shipped.data?.nothere
    return [carrier, missing]
  },
})
