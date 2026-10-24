import { query } from 'tentjs'
import { presence, users } from '../tables/tables'

// Who is here is read where its rows are, and a heavy query reads a table that stays.
export const whoIsHere = query('whoIsHere', { access: 'signedIn', rows: presence.oldest('createdAt').limit(100) })

export const everyone = query('everyone', { access: 'signedIn', heavy: true, rows: users.oldest('createdAt').limit(100) })
