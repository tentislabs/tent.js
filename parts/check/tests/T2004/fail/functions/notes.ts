import { change, input, query, role, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), count: text({ optional: true }) }, access: { read: 'signedIn' } })

export const openNotes = query('openNotes', { access: 'signedIn', rows: notes.where({ body: 'open' }).limit(20) })

export const addNote = change('addNote', {
  access: role('staff'),
  input: { body: text(), count: text({ optional: true }) },
  set: notes.add({ body: input('body'), count: input('count') }),
})
