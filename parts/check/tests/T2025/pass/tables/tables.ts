import { caller, count, link, list, number, table, text, where } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })

export const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: 'signedIn' },
})

// A row of a tenant table is read by the members of its team.
const mine = () => where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } })

export const tasks = table('tasks', {
  columns: { team: link('teams', { onRemove: 'remove' }), list: link('lists', { onRemove: 'remove' }), title: text() },
  tenant: 'team',
  access: { read: mine() },
})

// A list and its tasks stand in the file of one team: the count moves in the write of the task.
export const lists = table('lists', {
  columns: { team: link('teams', { onRemove: 'remove' }), name: text(), open: number({ from: count({ of: tasks, by: 'list' }) }) },
  tenant: 'team',
  access: { read: mine() },
})
