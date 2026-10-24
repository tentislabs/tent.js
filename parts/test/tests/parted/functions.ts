import { change, input, list, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { title: text(), body: text({ default: '' }) },
  access: { read: 'anyone', add: 'anyone' },
})

export const allNotes = query('allNotes', { access: 'anyone', rows: notes.oldest('title') })

export const userById = query('userById', {
  access: 'anyone',
  input: { id: text() },
  rows: users.where({ id: input('id') }).first(),
})

export const addNote = change('addNote', {
  access: 'anyone',
  input: { title: text() },
  set: notes.add({ title: input('title') }),
})
