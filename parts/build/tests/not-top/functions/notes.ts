import { query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

const hidden = query('hidden', { access: 'signedIn', rows: notes.where({ body: 'a' }) })

function make() {
  return query('made', { access: 'signedIn', rows: notes.count() })
}

export const openNote = query('openNotes', { access: 'signedIn', rows: notes.limit(10) })

