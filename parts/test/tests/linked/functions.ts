import { action, change, fail, input, query, table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'anyone', add: 'anyone' },
})

export const allNotes = query('allNotes', { access: 'anyone', rows: notes.oldest('words') })

export const noteOf = query('noteOf', {
  access: 'anyone',
  input: { id: text() },
  rows: notes.where({ id: input('id') }).first(),
})

export const addNote = change('addNote', {
  access: 'anyone',
  input: { words: text() },
  set: notes.add({ words: input('words') }),
})

// A call that fails with words of its own, for a text that says so.
export const refused = action('refused', {
  access: 'anyone',
  input: { words: text() },
  output: text(),
  run: async ({ input }) => {
    if (input.words === 'no') fail('refused', 'This is refused.')
    return input.words
  },
})

// An action that the page reads with no wait: its name is nothing until it has answered.
export const later = action('later', { access: 'anyone', output: text(), run: async () => 'came later' })
