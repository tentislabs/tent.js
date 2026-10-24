import { change, input, query, table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { note: text() },
  access: { read: 'anyone', add: 'anyone', remove: 'anyone' },
})

export const allNotes = query('allNotes', { access: 'anyone', rows: notes.oldest('note') })

export const noteOf = query('noteOf', {
  access: 'anyone',
  input: { id: text() },
  rows: notes.where({ id: input('id') }).first(),
})

export const addNote = change('addNote', {
  access: 'anyone',
  input: { note: text() },
  set: notes.add({ note: input('note') }),
})

export const dropNote = change('dropNote', {
  access: 'anyone',
  input: { id: text() },
  set: notes.remove(input('id')),
})
