import { change, flow, start, table, text } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'anyone', add: 'anyone' } })

// Work that waits between its two steps, long enough for the program to be ended and started again.
export const ship = flow('ship', {
  input: { order: text() },
  run: async ({ input, step }) => {
    await step('pack', () => `packed ${input.order}`)
    await step.wait('2 seconds')
    return step('send', () => `sent ${input.order}`)
  },
})

export const placeOrder = change('placeOrder', {
  access: 'anyone',
  input: { title: text() },
  output: text(),
  run: ({ input, db }) => {
    const order = db.orders.add({ title: input.title })
    start(ship, { order: order.id })
    return order.id
  },
})
