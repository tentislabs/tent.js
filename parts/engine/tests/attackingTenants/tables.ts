import { anyone, link, project, table, text } from 'tentjs'

const open = anyone('a test reads and writes it')

export const attackingTenants = project('attackingTenants', { backups: { every: false } })

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
