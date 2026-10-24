import { caller, link, list, table, text, where } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })

export const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: 'signedIn' },
})

// A row of a tenant table is read by the members of its team.
const mine = () => where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } })

// The column that `tenant` names is no link.
export const notes = table('notes', {
  columns: { team: text(), body: text() },
  tenant: 'team',
  access: { read: where({ team: caller('id') }) },
})

// It names no column of the table.
export const tasks = table('tasks', {
  columns: { title: text() },
  tenant: 'team',
  access: { read: 'signedIn' },
})

// The link may hold nothing.
export const drafts = table('drafts', {
  columns: { team: link('teams', { optional: true, onRemove: 'remove' }), body: text() },
  tenant: 'team',
  access: { read: mine() },
})

// The rows do not go with their tenant.
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'clear' }), title: text() },
  tenant: 'team',
  access: { read: mine() },
})

// The tenant is itself a row of a tenant table.
export const lines = table('lines', {
  columns: { order: link('orders', { onRemove: 'remove' }), title: text() },
  tenant: 'order',
  access: { read: where({ order: caller('id') }) },
})
