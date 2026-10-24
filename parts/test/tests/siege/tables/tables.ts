import { anyone, caller, link, list, number, table, text, where } from 'tentjs'

const open = anyone('an attack reads and writes it')

export const users = table('users', {
  columns: { name: text(), roles: list(text()), salary: number({ optional: true, private: true }) },
  access: { read: 'signedIn' },
})

// A note is its owner's own: nobody else reads it or changes it.
export const notes = table('notes', {
  columns: { title: text(), owner: link('users'), secret: text({ optional: true, private: true }) },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn', change: 'owner', remove: 'owner' },
})

export const words = table('words', {
  columns: { text: text({ unique: true }) },
  access: { read: open, add: open, change: open },
})

// Every visitor reads the staff, and nobody but the office what each is paid.
export const staff = table('staff', {
  columns: { name: text(), desk: text(), pay: number({ private: true }) },
  access: { read: open },
})

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: open, add: open, remove: open },
})

export const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: open, add: open },
})

// The orders of a team stand in the data file of that team, and its members alone reach them.
const mine = () => where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } })

export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text() },
  tenant: 'team',
  access: { read: mine(), add: mine(), change: mine(), remove: mine() },
})
