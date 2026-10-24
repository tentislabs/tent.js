import { change, input, number, query, role, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const openNotes = query('openNotes', { access: 'signedIn', rows: notes.where({ body: 'open' }).limit(20) })

export const addNote = change('addNote', {
  access: role('staff'),
  input: { body: text(), n: number() },
  set: notes.add({ body: input('body'), n: input('n') }),
})
