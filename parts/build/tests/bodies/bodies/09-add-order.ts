import { change, emit, fail, random, start, token } from 'tentjs'
import { invoiceApproval, markPaid, orderTotal, ordersPage } from '../app/shop.ts'

export const addOrder = change('addOrder', {
  access: 'everyone',
  run: ({ input, db, user, now }) => {
    const customer = db.customers.get(input.customer)
    if (!customer) fail('no-customer', 'That customer is not there.')
    const order = db.orders.add({ customer: customer.id, status: 'open', total: input.total, placedAt: now, code: token({ digits: 6 }), lucky: random() < 0.5, owner: user.id })
    db.payments.add({ order: order.id, amount: 0 })
    const { run } = start(invoiceApproval, { order: order.id })
    const { rows, next } = ordersPage({ after: input.after })
    emit('order.added', { order: order.id, run })
    if (input.paid) {
      markPaid({ order: order.id })
      db.orders.change(order.id, { status: 'paid', total: orderTotal({ order: order.id }) })
    } else {
      db.payments.remove(input.oldPayment)
    }
    return { order: order.id, run, others: rows.length, next }
  },
})
