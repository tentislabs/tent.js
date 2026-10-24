import { date, later, now, number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const stamps = table('stamps', { columns: { at: date() }, access: { read: 'signedIn' } })

export const fresh = query('fresh', { access: 'signedIn', rows: stamps.where({ at: { after: later(now(), '7 days') } }).limit(20) })
