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
  columns: {
    team: link('teams', { onRemove: 'remove' }),
    placedBy: link('users', { optional: true, onRemove: 'clear' }),
    title: text(),
  },
  tenant: 'team',
  access: { read: mine() },
})

// A link inside one file: an order line to its order.
export const lines = table('lines', {
  columns: { team: link('teams', { onRemove: 'remove' }), order: link('orders'), title: text() },
  tenant: 'team',
  access: { read: mine() },
})
