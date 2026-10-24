import { boolean, change, choice, input, link, number, query, table, text } from 'tentjs'

export const customers = table('customers', { columns: { name: text() }, access: { read: 'anyone' } })

export const orders = table('orders', {
  columns: {
    customer: link('customers', { optional: true }),
    name: text(),
    total: number({ min: 0 }),
    note: text({ optional: true, lines: 'many' }),
    rush: boolean(),
    status: choice(['open', 'paid'], { default: 'open' }),
  },
  access: { read: 'anyone', add: 'anyone', change: 'anyone' },
})

export const openOrders = query('openOrders', {
  access: 'anyone',
  input: { limit: number({ default: 50 }) },
  rows: orders.with('customer').limit(input('limit')),
})

export const addOrder = change('addOrder', {
  access: 'anyone',
  input: {
    name: text(),
    total: number({ min: 0, max: 1000 }),
    note: text({ optional: true, lines: 'many' }),
    rush: boolean(),
    status: choice(['open', 'paid'], { default: 'open' }),
    customer: link('customers', { optional: true }),
  },
  set: orders.add({
    name: input('name'),
    total: input('total'),
    note: input('note'),
    rush: input('rush'),
    status: input('status'),
    customer: input('customer'),
  }),
})
