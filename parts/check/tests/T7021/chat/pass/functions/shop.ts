import { change, list, object, query, text } from 'tentjs'

export const openOrders = query('openOrders', {
  about: 'The orders that the caller placed',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: list(object({ title: text() })),
  run: () => [{ title: 'Tea' }],
})

export const addOrder = change('addOrder', {
  about: 'Adds an order for the caller',
  access: 'signedIn',
  offer: ['mcp'],
  input: { title: text() },
  output: text(),
  run: ({ input }) => input.title,
})
