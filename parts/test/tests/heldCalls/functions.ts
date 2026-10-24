import { change, input, query, table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'anyone', add: 'anyone' },
})

export const allNotes = query('allNotes', { access: 'anyone', rows: notes.oldest('words') })

export const addNote = change('addNote', {
  access: 'anyone',
  input: { words: text() },
  set: notes.add({ words: input('words') }),
})
