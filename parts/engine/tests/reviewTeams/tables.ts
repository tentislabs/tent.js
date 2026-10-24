import { anyone, link, list, project, table, text } from 'tentjs'

const open = anyone('a test reads and writes it')

export const reviewTeams = project('reviewTeams', {
  backups: { every: false },
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: open, add: open },
})

// The orders of each team stand in a data file of that team.
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text() },
  tenant: 'team',
  access: { read: open, add: open },
})
