import { query, text } from 'tentjs'

export const openOrders = query('openOrders', {
  about: 'The open orders',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'none',
})
