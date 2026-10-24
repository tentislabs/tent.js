import { change, choice, input, number, query, table, text } from 'tentjs'

export const orders = table('orders', {
  columns: { name: text(), status: choice(['open', 'paid'], { messages: 'status' }), total: number({ whole: true }) },
  access: { read: 'anyone', add: 'anyone' },
})

export const allOrders = query('allOrders', { access: 'anyone', rows: orders.oldest('name') })

export const addOrder = change('addOrder', {
  access: 'anyone',
  input: { name: text(), status: choice(['open', 'paid'], { messages: 'status' }), total: number({ whole: true }) },
  set: orders.add({ name: input('name'), status: input('status'), total: input('total') }),
})
