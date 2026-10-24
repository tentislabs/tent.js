import { later, now, number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

const cutoff = later(now(), '7 days')

export const openNotes = query('openNotes', { access: 'signedIn', rows: notes.where({ body: String(cutoff) }).limit(20) })
