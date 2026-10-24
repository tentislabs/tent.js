import { query } from 'tentjs'
import type { Link } from 'tentjs/ui'
import { notes } from './notes'

export type Shown = typeof Link

export const shown = query('shown', { access: 'signedIn', rows: notes.limit(5) })
