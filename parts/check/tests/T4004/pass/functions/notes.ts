import { number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const openNotes = query('openNotes', { access: 'signedIn', live: false, rows: notes.where({ body: 'open' }) })

export const howMany = query('howMany', { access: 'signedIn', rows: notes.count() })
