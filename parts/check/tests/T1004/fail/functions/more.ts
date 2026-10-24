import { query } from 'tentjs'
import { notes } from './notes'

export const openNotes = query('openNotes', { access: 'signedIn', rows: notes.limit(5) })
