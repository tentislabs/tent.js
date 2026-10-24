import { date, list, number, table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { body: text(), n: number(), at: date(), tags: list(text()) },
  access: { read: 'signedIn' },
})

export const marks = table('marks', { columns: { id: text() }, access: { read: 'signedIn' } })
