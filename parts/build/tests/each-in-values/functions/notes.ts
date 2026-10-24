import { each, input, list, number, query, table } from 'tentjs'

export const notes = table('notes', { columns: { n: number() }, access: { read: 'signedIn' } })

export const byLines = query('byLines', {
  access: 'signedIn',
  input: { lines: list(number()) },
  rows: notes.where({ n: { in: each(input('lines'), (line) => line) } }),
})
