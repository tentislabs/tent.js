import { change, input, table, text } from 'tentjs'

// Every definition here was touched by a test in its last run.
export const orders = table('orders', {
  columns: { title: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})
