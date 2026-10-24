import { change, input, link, object, query, table, text } from 'tentjs'

export const orders = table('orders', {
  columns: { name: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

// A query in code that may answer nothing: no row has that id.
export const getOrder = query('getOrder', {
  access: 'signedIn',
  input: { id: text() },
  run: ({ input, db }) => db.orders.get(input.id),
})

// A change in code that states no output: it answers nothing, whatever its `run` gives back.
export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { name: text() },
  run: ({ input, db }) => db.orders.add({ name: input.name }),
})

// The same with a stated output: it answers the id of the row.
export const addOrderOut = change('addOrderOut', {
  access: 'signedIn',
  input: { name: text() },
  output: object({ id: link('orders') }),
  run: ({ input, db }) => db.orders.add({ name: input.name }),
})

// A change in our own words answers the row of its write.
export const addOrderSet = change('addOrderSet', {
  access: 'signedIn',
  input: { name: text() },
  set: orders.add({ name: input('name') }),
})
