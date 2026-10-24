import { anyone, boolean, link, number, table, text } from 'tentjs'

const open = anyone('a test reads and writes it')
const all = { read: open, add: open, change: open, remove: open }

export const teams = table('teams', {
  columns: { name: text() },
  access: all,
})

// The shared file: a note holds a sealed text, which no archive holds open.
export const notes = table('notes', {
  columns: { title: text(), secret: text({ sealed: true, optional: true }), count: number({ default: 0 }) },
  access: all,
})

// A file for each team.
export const tasks = table('tasks', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text(), done: boolean({ default: false }) },
  tenant: 'team',
  access: all,
})
