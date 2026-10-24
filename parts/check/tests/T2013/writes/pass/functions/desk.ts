import { caller, change, input, link, list, table, text, where } from 'tentjs'

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

// Two writes of one file.
export const addTwo = change('addTwo', {
  access: 'signedIn',
  input: { team: text(), first: text(), second: text() },
  set: [orders.of(input('team')).add({ title: input('first') }), orders.of(input('team')).add({ title: input('second') })],
})
