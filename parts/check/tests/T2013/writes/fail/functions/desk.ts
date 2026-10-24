import { caller, change, input, link, list, role, table, text, where } from 'tentjs'

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
  access: { read: mine(), add: mine() },
})

export const log = table('log', { columns: { what: text() }, access: { read: 'signedIn', add: 'signedIn' } })

// Two tenants in one change.
export const copyOrder = change('copyOrder', {
  access: 'signedIn',
  input: { from: text(), to: text(), title: text() },
  set: [orders.of(input('from')).add({ title: input('title') }), orders.of(input('to')).add({ title: input('title') })],
})

// The shared file and the file of a tenant in one change.
export const addLogged = change('addLogged', {
  access: role('staff'),
  input: { team: text(), title: text() },
  set: [log.add({ what: input('title') }), orders.of(input('team')).add({ title: input('title') })],
})
