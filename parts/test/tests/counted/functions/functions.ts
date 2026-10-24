import { anyone, change, choice, input, number, text } from 'tentjs'
import { customers } from '../tables/customers'
import { orders } from '../tables/orders'

const open = anyone('a test calls it')

export const addCustomer = change('addCustomer', {
  access: open,
  input: { name: text() },
  set: customers.add({ name: input('name') }),
})

export const addOrder = change('addOrder', {
  access: open,
  input: { customer: text(), total: number(), status: choice(['open', 'paid']) },
  set: orders.add({ customer: input('customer'), total: input('total'), status: input('status') }),
})

// A change of an order: its status, its total, and the customer it belongs to.
export const setOrder = change('setOrder', {
  access: open,
  input: { order: text(), customer: text(), total: number(), status: choice(['open', 'paid']) },
  set: orders.change(input('order'), { customer: input('customer'), total: input('total'), status: input('status') }),
})

export const removeOrder = change('removeOrder', {
  access: open,
  input: { order: text() },
  set: orders.remove(input('order')),
})

// A raw write, which the store carries out as it is written: every open order of a customer is paid.
export const payAll = change('payAll', {
  access: open,
  system: 'a test writes with raw SQL',
  touches: ['orders'],
  input: { customer: text() },
  output: number(),
  run: ({ db, input: given }) => {
    db.sql(`UPDATE "orders" SET "status" = 'paid' WHERE "customer" = ?`, [db.n('customers', given.customer)])
    return 0
  },
})

// A kept count is the engine's to write: a change that names it is refused.
export const setCount = change('setCount', {
  access: open,
  input: { customer: text() },
  output: number(),
  run: ({ db, input: given }) => {
    db.customers.change(given.customer, { openOrders: 3 })
    return 0
  },
})
