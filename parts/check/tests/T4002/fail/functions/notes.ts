import { number, query, random, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const lucky = query('lucky', { access: 'signedIn', output: number(), run: () => random() })

export const luckier = query('luckier', { access: 'signedIn', output: number(), run: () => Math.floor(Math.random() * 6) })
