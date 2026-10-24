import { query } from 'tentjs'
import { customers } from '../app/shop.ts'

export const orderPage = query('orderPage', {
  access: 'everyone',
  reads: [customers],
  run: ({ input, db, user }) => {
    const order = db.orders.get(input.order)
    if (!order) return
    const base = input.mine ? db.orders.where({ owner: user.id }) : db.orders
    const found = base.where({ customer: order.customer })
    const customers = db.customers.where({ id: order.customer }).all()
    return {
      order,
      customer: customers[0],
      others: found.with('customer').limit(20).all(),
      paid: db.payments.where({ order: order.id }).first()?.amount ?? 0,
      payments: db.payments.where({ order: order.id }).count(),
      history: db.orders.history(order.id),
      open: db.orders.count({ status: 'open' }),
    }
  },
})
