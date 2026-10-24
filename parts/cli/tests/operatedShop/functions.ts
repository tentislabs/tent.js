import { change, input, query, table, text } from 'tentjs'

// A function and a row for a signed-in caller, offered to the API, which a key of the right `operate` does not reach.
export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn', add: 'signedIn' } })

export const addOrder = change('addOrder', {
  about: 'Adds an order',
  access: 'signedIn',
  offer: ['api'],
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

export const everyOrder = query('everyOrder', {
  about: 'Every order, by its title',
  access: 'signedIn',
  offer: ['api'],
  rows: orders.sort('title'),
})
