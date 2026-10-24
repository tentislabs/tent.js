import { query, table, text } from 'tentjs'
import { LABEL } from '../../shared/far/labels'

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

export const labelled = query('labelled', { access: 'signedIn', about: LABEL, rows: notes.where({ body: LABEL }) })
