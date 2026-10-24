import { anyone, change, file, input, query, text } from 'tentjs'
import { notes } from '../tables/notes.ts'

const open = anyone('the notes are open to anyone')

export const allNotes = query('allNotes', { access: open, rows: notes.newest('createdAt').limit(100) })

export const addNote = change('addNote', {
  access: open,
  input: { title: text(), secret: text(), picture: file({ optional: true }) },
  set: notes.add({ title: input('title'), secret: input('secret'), picture: input('picture') }),
})
