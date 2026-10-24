import { anyone, link, number, table, text } from 'tentjs'

const open = anyone('a test reads and writes it')
const all = { read: open, add: open, change: open, remove: open }

export const teams = table('teams', {
  columns: { name: text() },
  access: all,
})

// The shared file. The next version requires `first`, which its backfill fills.
export const people = table('people', {
  columns: { fullName: text(), first: text({ optional: true }), runs: number({ default: 0 }) },
  access: all,
})

// A file for each team.
export const tasks = table('tasks', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text(), runs: number({ default: 0 }) },
  tenant: 'team',
  access: all,
})
