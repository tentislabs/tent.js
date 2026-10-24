import { anyone, link, project, table, text, where } from 'tentjs'

const open = anyone('a test reads and writes it')

export const counter = project('counter', {
  limits: { openFiles: 50, filesAtOnce: 2 },
  backups: { every: false },
})

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: open, add: open },
})

// The orders of each team stand in a data file of that team.
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text(), code: text({ optional: true }) },
  tenant: 'team',
  access: { read: open, add: open },
})

// Its read rule is code, and reads the clock: a query answers the same for the same data, so no query may read it.
export const stamps = table('stamps', {
  columns: { label: text() },
  access: {
    read: where(() => (Date.now() > 0 ? {} : { label: 'none' })),
    add: open,
  },
})
