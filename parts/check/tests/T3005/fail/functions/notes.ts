import { query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

export const openNotes = query('openNotes', { access: 'signedIn', rows: notes.where({ body: 'open' }).limit(20) })

export const audit = table('audit', { columns: { line: text() }, access: {} })
