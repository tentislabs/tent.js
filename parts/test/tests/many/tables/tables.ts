import { anyone, boolean, caller, link, list, table, text, where } from 'tentjs'

const open = anyone('a test reads and writes it from every machine')

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: open },
})

export const orders = table('orders', {
  columns: { title: text(), paid: boolean({ default: false }) },
  access: { read: open, add: open, change: open, remove: open },
})

export const customers = table('customers', {
  columns: { name: text() },
  access: { read: open, add: open },
})

export const teams = table('teams', {
  columns: { name: text(), open: boolean({ default: true }) },
  access: { read: open, add: open },
})

// Its rule reads `teams`: a member is read where its team is open.
export const members = table('members', {
  columns: { user: link('users', { optional: true }), team: link('teams') },
  access: { read: where({ team: { in: teams.where({ open: true }).pick(['id']) } }), add: open },
})

// Its rule reads `members`, whose rule reads `teams`: a note is read by the members of its team.
export const notes = table('notes', {
  columns: { body: text(), team: link('teams') },
  access: { read: where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } }), add: open },
})
