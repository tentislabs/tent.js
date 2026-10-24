import { link, project, table, text } from 'tentjs'

export const sealedTeams = project('sealedTeams', {
  limits: { filesAtOnce: 2 },
  backups: { every: false },
})

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: 'anyone', add: 'anyone' },
})

// What each team keeps for itself, in a data file of that team, stored encrypted, each value by itself.
export const vault = table('vault', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text(), note: text({ sealed: true }) },
  tenant: 'team',
  access: { read: 'anyone', add: 'anyone' },
})
