import { change, list, object, query, text } from 'tentjs'

export const openOrders = query('openOrders', {
  about: 'The orders that the caller placed',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: list(object({ title: text() })),
  run: () => [{ title: 'Tea' }],
})

// Called by the screen in a chat, and not offered to MCP.
export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  output: text(),
  run: ({ input }) => input.title,
})
