import { change, fail, file, link, list, number, object, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { title: text(), photo: file({ optional: true }), placedBy: link('users', { optional: true }) },
  owner: 'placedBy',
  access: { read: 'owner', add: 'signedIn', change: 'owner' },
})

export const openOrders = query('openOrders', {
  about: 'The orders that the caller placed',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: list(object({ title: text(), photo: file({ optional: true }) })),
  run: ({ db }) => db.orders.all().map((one) => ({ title: one.title, photo: one.photo })),
})

export const addOrder = change('addOrder', {
  about: 'Adds an order for the caller',
  access: 'signedIn',
  offer: ['mcp'],
  input: { title: text({ min: 3 }), photo: file({ optional: true }) },
  output: object({ id: text() }),
  run: ({ db, user, input }) => {
    if (input.title === 'Taken') fail('taken', 'That title is taken.', { fields: { title: 'That title is taken.' } })
    return { id: db.orders.add({ title: input.title, photo: input.photo, placedBy: user?.id }).id }
  },
})

export const countAll = query('countAll', {
  about: 'How many orders the caller has, which no screen in a chat reads',
  access: 'signedIn',
  input: {},
  output: number(),
  run: ({ db }) => db.orders.all().length,
})
