import { caller, count, link, list, number, table, text, where } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: 'signedIn' },
})

// A row of a tenant table is read by the members of its team.
const mine = () => where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } })

export const tasks = table('tasks', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text() },
  tenant: 'team',
  access: { read: mine() },
})

// The teams stand in the shared file, and their tasks in the file of each team: one write cannot move both.
export const teams = table('teams', {
  columns: { name: text(), open: number({ from: count({ of: tasks, by: 'team' }) }) },
  access: { read: 'signedIn' },
})
