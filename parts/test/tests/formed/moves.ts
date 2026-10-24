import { change, input, object, query, table, text } from 'tentjs'

export const homes = table('homes', {
  columns: { owner: text(), address: object({ city: text(), street: text() }), tag: text({ optional: true }) },
  access: { read: 'anyone', add: 'anyone' },
})

export const allHomes = query('allHomes', { access: 'anyone', rows: homes.oldest('owner').limit(20) })

export const addHome = change('addHome', {
  access: 'anyone',
  input: { owner: text(), address: object({ city: text(), street: text() }), tag: text({ optional: true }) },
  set: homes.add({ owner: input('owner'), address: input('address'), tag: input('tag') }),
})

// A sign-up of sorts: a name, a word that is never sent back, and a city, after which the page goes to the new home.
export const join = change('join', {
  access: 'anyone',
  input: { owner: text(), secret: text({ secret: true }), city: text(), street: text({ default: 'Main' }) },
  set: homes.add({ owner: input('owner'), address: { city: input('city'), street: input('street') } }),
})

export const homeOf = query('homeOf', {
  access: 'anyone',
  input: { owner: text() },
  rows: homes.where({ owner: input('owner') }).first(),
})
