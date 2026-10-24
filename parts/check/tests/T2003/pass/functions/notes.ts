import { change, input, query, role, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: text() }, access: { read: 'signedIn' } })

export const openNotes = query('openNotes', { access: 'signedIn', rows: notes.where({ body: 'open' }).limit(20) })

export const addNote = change('addNote', {
  access: role('staff'),
  input: { body: text(), n: text() },
  set: notes.add({ body: input('body'), n: input('n') }),
})

export const tags = table('tags', { columns: { word: text() }, access: { read: 'signedIn' } })

export const openTags = query('openTags', { access: 'signedIn', rows: tags.limit(20) })
