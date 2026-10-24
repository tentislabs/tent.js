import { change, fail } from 'tentjs'

export const payOrder = change('payOrder', {
  access: 'everyone',
  run: ({ input, db }) => {
    const order = db.orders.get(input.order)
    db.payments.add({ order: input.order, amount: input.amount })
    if (!order || order.status != 'open') fail('not-open', `Order ${input.order} is not open.`)
    db.orders.change(order.id, { status: 'paid' })
    return order.id
  },
})
