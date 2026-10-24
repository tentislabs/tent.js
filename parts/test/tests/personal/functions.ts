import { anyone, change, input, list, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { title: text() },
  access: { read: 'anyone', add: anyone('a test adds a note to the board') },
})

// What the shared part of the board reads.
export const allNotes = query('allNotes', { access: 'anyone', rows: notes.oldest('title').limit(50) })

// What the header of each visitor reads.
export const headerNotes = query('headerNotes', { access: 'anyone', rows: notes.oldest('title').limit(50) })

export const addNote = change('addNote', {
  access: anyone('a test adds a note to the board'),
  input: { title: text() },
  set: notes.add({ title: input('title') }),
})
