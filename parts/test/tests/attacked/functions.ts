import { change, table, text } from 'tentjs'

export const things = table('things', {
  columns: { name: text() },
  access: { read: 'anyone', add: 'anyone' },
})

// What a form of the page sends, whose `then` names an address that leads nowhere.
export const touch = change('touch', { access: 'anyone', set: things.add({ name: 'touched' }) })
