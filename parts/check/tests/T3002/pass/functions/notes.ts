import { anyone, change, input, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

export const openNotes = query('openNotes', { access: 'signedIn', rows: notes.where({ body: 'open' }).limit(20) })

export const addNote = change('addNote', {
  access: anyone('the contact form is public'),
  input: { body: text() },
  system: 'a visitor has no row of their own, so the note is written for them',
  set: notes.add({ body: input('body') }),
})
