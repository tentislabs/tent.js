import { query } from 'tentjs'

export const buyerLine = query('buyerLine', {
  access: 'everyone',
  run: ({ input, db }) => {
    const order = db.orders.get(input.order)
    const customer = db.customers.get(order.customer)
    return `${customer.name} <${customer.email}>`
  },
})
