import { query } from 'tentjs'
import { notes } from '../tables/notes'

export const twice = query('twice', { access: 'signedIn', rows: notes.limit(5) })
