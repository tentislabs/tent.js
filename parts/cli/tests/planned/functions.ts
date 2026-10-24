import { boolean, change, input, list, number, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const orders = table('orders', {
  columns: { title: text(), count: number(), urgent: boolean({ default: false }) },
  access: { read: 'signedIn', add: 'signedIn', remove: 'signedIn' },
})

export const openOrders = query('openOrders', { access: 'signedIn', rows: orders.oldest('title') })

export const countOrders = query('countOrders', { access: 'signedIn', rows: orders.count() })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text(), count: number(), urgent: boolean() },
  set: orders.add({ title: input('title'), count: input('count'), urgent: input('urgent') }),
})

export const addSample = change('addSample', {
  access: 'signedIn',
  set: orders.add({ title: 'A sample', count: 1, urgent: false }),
})
