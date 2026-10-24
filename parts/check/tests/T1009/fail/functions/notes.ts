import { number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const marks = table('marks', { columns: { id: text() }, access: { read: 'signedIn' } })

export const openNotes = query('openNotes', { access: 'signedIn', rows: notes.where({ body: 'open' }).limit(20) })
