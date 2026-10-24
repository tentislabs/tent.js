import { caller, link, list, table, text, where } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })

export const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: 'signedIn' },
})

// A row of a tenant table is read by the members of its team.
const mine = () => where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } })

export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text() },
  tenant: 'team',
  access: { read: mine() },
})

// A line is read by who may read its order: the plan is read in the file that the rule is applied in.
export const lines = table('lines', {
  columns: { team: link('teams', { onRemove: 'remove' }), order: link('orders', { onRemove: 'remove' }) },
  tenant: 'team',
  access: { read: where({ order: { in: orders.pick(['id']) } }) },
})
