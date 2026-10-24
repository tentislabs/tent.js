import { anyone, link, table, text } from 'tentjs'

const open = anyone('a test reads and writes it')

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: open, add: open },
})

export const rooms = table('rooms', {
  columns: { name: text() },
  access: { read: open, add: open },
})

// A tenant table in every version, by another table than the notes: the app keeps files from its first version on.
export const signs = table('signs', {
  columns: { room: link('rooms', { onRemove: 'remove' }), words: text() },
  tenant: 'room',
  access: { read: open, add: open },
})

// The table that moves: a test builds one version that keeps it in the shared file, and one that makes it a tenant table.
// A code is the only one of its kind: in the whole app in the one version, and for its team in the other.
export const notes = table('notes', {
  columns: {
    team: link('teams', { onRemove: 'remove' }),
    body: text(),
    code: text({ optional: true, unique: true }),
  },
  // where the notes live
  access: { read: open, add: open, change: open },
})
