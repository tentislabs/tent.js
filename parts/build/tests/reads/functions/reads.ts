import { query } from 'tentjs'
import { LIMIT } from '../shared/values'
import { plainTable } from '../tables/reads'

export const helperLimit = query('helperLimit', { access: 'signedIn', rows: plainTable.limit(LIMIT) })

export const plainQuery = query('plainQuery', { access: 'signedIn', rows: plainTable.limit(5) })
