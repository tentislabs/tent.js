import { query } from 'tentjs'
import { Link } from 'tentjs/ui'
import { notes } from '../tables/notes'

export const shown = query('shown', { access: 'signedIn', about: String(Link), rows: notes.limit(5) })
