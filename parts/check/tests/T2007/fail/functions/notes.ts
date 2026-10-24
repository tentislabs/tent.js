import { link, list, number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number(), by: link('users') }, owner: 'n', access: { read: 'signedIn' } })

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const openNotes = query('openNotes', { access: 'signedIn', rows: notes.where({ body: 'open' }).limit(20) })
