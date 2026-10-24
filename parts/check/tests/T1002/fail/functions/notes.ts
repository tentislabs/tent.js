import { number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const openNote = query('openNotes', { access: 'signedIn', rows: notes.limit(20) })
