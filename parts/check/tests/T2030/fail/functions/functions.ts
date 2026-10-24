import { query } from 'tentjs'
import { presence } from '../tables/tables'

// A heavy query of a table kept in memory runs on the writer's main thread all the same.
export const whoIsHere = query('whoIsHere', { access: 'signedIn', heavy: true, rows: presence.oldest('createdAt').limit(100) })
