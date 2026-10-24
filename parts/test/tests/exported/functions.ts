import { change, input, list, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { slug: text(), body: text() },
  access: { read: 'anyone', add: 'anyone' },
})

export const allNotes = query('allNotes', { access: 'anyone', rows: notes.oldest('slug') })

export const noteBySlug = query('noteBySlug', {
  access: 'anyone',
  input: { slug: text() },
  rows: notes.where({ slug: input('slug') }).first(),
})

export const addNote = change('addNote', {
  access: 'anyone',
  input: { slug: text(), body: text() },
  set: notes.add({ slug: input('slug'), body: input('body') }),
})
