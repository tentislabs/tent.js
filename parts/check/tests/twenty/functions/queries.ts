import { later, now, number, query, random } from 'tentjs'
import { notes } from '../tables/notes'

const cutoff = later(now(), '7 days')

export const stamp = query('stamp', { access: 'signedIn', about: String(cutoff), output: number(), run: () => Date.now() })

export const lucky = query('lucky', { access: 'signedIn', output: number(), run: () => random() })

export const rates = query('rates', { access: 'signedIn', run: () => fetch('https://rates.example.com') })

export const every = query('every', { access: 'signedIn', rows: notes.where({ body: 'open' }) })

export const size = query('size', { access: 'signedIn', output: number(), run: async ({ db }) => db.notes.count() })
