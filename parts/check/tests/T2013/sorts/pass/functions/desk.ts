import { caller, input, link, list, query, table, text, where } from 'tentjs'

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
    // The row keeps a copy of the value it is sorted by.
    placedByName: text({ optional: true }),
    title: text(),
  },
  tenant: 'team',
  access: { read: mine() },
})

export const byName = query('byName', {
  access: 'signedIn',
  input: { team: text() },
  rows: orders.of(input('team')).sort('placedByName').limit(50),
})

// A filter through such a link is answered: the shared side is read first.
export const ofAda = query('ofAda', {
  access: 'signedIn',
  input: { team: text() },
  rows: orders.of(input('team')).where({ 'placedBy.name': 'Ada' }).limit(50),
})
