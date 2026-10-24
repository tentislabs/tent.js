import { query, text } from 'tentjs'

export const count1 = query('count1', {
  about: 'Counts the orders of week 1',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'week 1',
})

export const count2 = query('count2', {
  about: 'Counts the orders of week 2',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: text(),
  run: () => 'week 2',
})
