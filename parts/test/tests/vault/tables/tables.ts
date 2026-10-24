import { anyone, link, number, table, text } from 'tentjs'

const open = anyone('a test reads and writes it')

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: open, add: open, remove: open },
})

// The orders of each team stand in a data file of that team: the raw SQL below runs in one such file.
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text(), total: number({ default: 0 }) },
  tenant: 'team',
  access: { read: open, add: open, change: open, remove: open },
})
