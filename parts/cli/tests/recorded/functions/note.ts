import { change, input, text } from 'tentjs'
import { notes } from '../tables/notes'

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { words: text({ min: 1 }) },
  set: notes.add({ words: input('words') }),
})
