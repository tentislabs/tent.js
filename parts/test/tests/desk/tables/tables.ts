import { anyone, caller, link, list, number, table, text, where } from 'tentjs'

const open = anyone('a test reads and writes it')

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: open, add: open, remove: open },
})

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: open, add: open, remove: open },
})

export const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: open, add: open },
})

// A row of a tenant table is reached by the members of its team: a rule through a table of the shared file.
const mine = () =>
  where({
    team: {
      in: members.where({ user: caller('id') }).pick(['team']),
    },
  })
const byMembers = () => ({ read: mine(), add: mine(), change: mine(), remove: mine() })

export const orders = table('orders', {
  columns: {
    team: link('teams', { onRemove: 'remove' }),
    title: text(),
    total: number({ default: 0 }),
    code: text({ optional: true }),
    placedBy: link('users', { optional: true, onRemove: 'remove' }),
  },
  tenant: 'team',
  access: byMembers(),
})

export const lines = table('lines', {
  columns: {
    team: link('teams', { onRemove: 'remove' }),
    order: link('orders', { onRemove: 'remove' }),
    qty: number(),
  },
  tenant: 'team',
  access: byMembers(),
})
