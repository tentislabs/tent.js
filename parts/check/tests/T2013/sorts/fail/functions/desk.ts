import { caller, count, input, link, list, query, table, text, where } from 'tentjs'

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

// A sort through a link from a tenant's file into the shared file.
export const byName = query('byName', {
  access: 'signedIn',
  input: { team: text() },
  rows: orders.of(input('team')).sort('placedBy.name').limit(50),
})

// A group through such a link.
export const perName = query('perName', {
  access: 'signedIn',
  input: { team: text() },
  rows: orders.of(input('team')).group('placedBy.name', { n: count() }),
})

// The same in the code of a query.
export const inCode = query('inCode', {
  access: 'signedIn',
  input: { team: text() },
  run: ({ db, input }) => db.orders.of(input.team).newest('team.name').limit(50).all(),
})
