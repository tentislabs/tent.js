import { number, query } from 'tentjs'
import { notes } from '../tables/notes'

const hidden = query('hidden', { access: 'signedIn', rows: notes.limit(5) })

export const openNote = query('openNotes', { access: 'signedIn', rows: notes.limit(20) })

export const unknown = query('unknown', { access: 'signedIn', lmit: 5, rows: notes.limit(20) })

export const twoForms = query('twoForms', { access: 'signedIn', output: number(), rows: notes.limit(20), run: ({ db }) => db.notes.count() })

export const noAccess = query('noAccess', { rows: notes.limit(20) })

export const badWord = query('badWord', { access: 'signedIn', refresh: 'soon', rows: notes.limit(20) })

export const bad_name = query('bad_name', { access: 'signedIn', rows: notes.limit(20) })

export const twice = query('twice', { access: 'signedIn', rows: notes.limit(10) })

export const most = 20
