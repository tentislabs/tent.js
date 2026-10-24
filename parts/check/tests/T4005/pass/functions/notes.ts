import { number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const size = query('size', { access: 'signedIn', output: number(), run: ({ db }) => db.notes.count() })
