import { action, change, fail, input, list, number, query, role, table, text } from 'tentjs'

// An action that counts how often it was called, and a query that tells the count: a screen that is fetched ahead
// of a move calls no action.
let quoted = 0

export const quote = action('quote', { access: 'anyone', output: number(), run: async () => ++quoted })

export const quotes = query('quotes', { access: 'anyone', output: number(), run: () => quoted })

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const cards = table('cards', {
  columns: { title: text(), rank: number() },
  access: { read: 'anyone', add: 'anyone', change: 'anyone', remove: 'anyone' },
})

export const allCards = query('allCards', { access: 'anyone', rows: cards.sort('rank') })

// A page of three cards at a time, with the cursor of the page that follows.
export const cardPage = query('cardPage', {
  access: 'anyone',
  input: { after: text({ optional: true }) },
  rows: cards.sort('rank').limit(3).after(input('after')),
})

export const countCards = query('countCards', { access: 'anyone', rows: cards.count() })

export const staffCards = query('staffCards', { access: role('staff'), rows: cards.sort('rank') })

export const quietCards = query('quietCards', { access: 'anyone', live: false, rows: cards.sort('rank') })

export const addCard = change('addCard', {
  access: 'anyone',
  input: { title: text(), rank: number() },
  set: cards.add({ title: input('title'), rank: input('rank') }),
})

export const moveCard = change('moveCard', {
  access: 'anyone',
  input: { card: text(), rank: number() },
  set: cards.change(input('card'), { rank: input('rank') }),
})

export const dropCard = change('dropCard', {
  access: 'anyone',
  input: { card: text() },
  set: cards.remove(input('card')),
})

// A change that says no in its own words, and writes nothing.
export const keepCard = change('keepCard', {
  access: 'anyone',
  input: { card: text() },
  run: () => {
    fail('kept', 'This card stays.')
  },
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const setRoles = change('setRoles', {
  access: 'nobody',
  input: { user: text(), roles: list(text()) },
  set: users.change(input('user'), { roles: input('roles') }),
})
