import { caller, link, list, number, role, table, text, where } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn', add: 'signedIn' },
})

// The salary is read by the people of `hr` alone, the bonus by the manager of the row alone, and the words about
// a person, which the table is searched by, by `hr` too.
export const staff = table('staff', {
  columns: {
    name: text(),
    manager: link('users', { optional: true, onRemove: 'clear' }),
    salary: number({ read: role('hr') }),
    bonus: number({ optional: true, read: where({ manager: caller('id') }) }),
    about: text({ optional: true, read: role('hr') }),
  },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
  search: ['name', 'about'],
})

// A desk links to the person who holds it: the linked row is held to the same rules.
export const desks = table('desks', {
  columns: { label: text(), holder: link('staff', { onRemove: 'clear', optional: true }) },
  access: { read: 'signedIn', add: 'signedIn' },
})

// Sealed values that are found by an equal value, and never told: two columns that may hold the same value.
export const accounts = table('accounts', {
  columns: {
    email: text({ sealed: { findable: true } }),
    spare: text({ optional: true, sealed: { findable: true } }),
  },
  access: { read: 'signedIn', add: 'signedIn' },
})
