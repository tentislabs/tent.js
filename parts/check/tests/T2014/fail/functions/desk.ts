import { caller, link, list, table, text, where } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })

export const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: 'signedIn' },
})

// A row of a tenant table is read by the members of its team.
const mine = () => where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } })

// Whoever is signed in reads the orders of every team.
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text() },
  tenant: 'team',
  access: { read: 'signedIn' },
})

// The rule names another column, and never the team.
export const notes = table('notes', {
  columns: { team: link('teams', { onRemove: 'remove' }), by: link('users', { onRemove: 'remove' }), body: text() },
  tenant: 'team',
  access: { read: where({ by: caller('id') }), add: mine() },
})
