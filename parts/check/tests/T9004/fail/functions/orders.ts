import { change, input, query, table, text } from 'tentjs'

export const orders = table('orders', {
  columns: { title: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

// A table and a function that no test touched in its last run.
export const archive = table('archive', {
  columns: { title: text() },
  access: { read: 'signedIn' },
})

export const forgotten = query('forgotten', {
  access: 'signedIn',
  output: text(),
  run: () => 'never asked',
})
