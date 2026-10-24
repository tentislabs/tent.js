import { change, link, list, number, table, text } from 'tentjs'

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const customers = table('customers', {
  columns: { name: text(), email: text() },
  access: { read: 'signedIn' },
})

export const orders = table('orders', {
  columns: { customer: link('customers'), total: number({ min: 0 }) },
  access: { read: 'signedIn' },
})

// One customer and one big order of that customer, which sets the flow off.
export const placeBigOrder = change('placeBigOrder', {
  access: 'signedIn',
  input: {},
  run: ({ db }) => {
    const customer = db.customers.add({ name: 'Ada', email: 'ada@example.com' })
    db.orders.add({ customer: customer.id, total: 2000 })
  },
})
