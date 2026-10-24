import { change, input, table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { text: text() },
  access: { add: 'anyone' },
})

export const addNote = change('addNote', {
  access: 'anyone',
  input: { text: text() },
  set: notes.add({ text: input('text') }),
})
