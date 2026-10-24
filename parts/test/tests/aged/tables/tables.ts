import { anyone, choice, date, link, table, text } from 'tentjs'

const open = anyone('a test reads and writes it')
const all = { read: open, add: open, change: open, remove: open }

// Kept for ninety days by the moment of each.
export const events = table('events', {
  columns: { at: date(), kind: text() },
  access: all,
  lasts: { for: '90 days', by: 'at' },
})

// Kept for thirty days, but the lines of an error, which stay.
export const lines = table('lines', {
  columns: { at: date(), level: choice(['info', 'error']), words: text() },
  access: all,
  lasts: { for: '30 days', by: 'at', where: { level: 'info' } },
})

// A pin holds its event: an old event that is pinned stays.
export const pins = table('pins', {
  columns: { event: link('events', { onRemove: 'refuse' }) },
  access: all,
})

// A note goes with its event.
export const notes = table('notes', {
  columns: { event: link('events', { onRemove: 'remove' }), words: text() },
  access: all,
})

// What the flow of a removal writes: the event that went.
export const gone = table('gone', {
  columns: { event: text() },
  access: all,
})

export const teams = table('teams', {
  columns: { name: text() },
  access: all,
})

// A tenant table, kept for a week in each file.
export const visits = table('visits', {
  columns: { team: link('teams', { onRemove: 'remove' }), at: date() },
  tenant: 'team',
  access: all,
  lasts: { for: '7 days', by: 'at' },
})
