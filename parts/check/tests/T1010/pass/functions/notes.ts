import { number, query, round, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const total = query('total', {
  access: 'signedIn',
  input: { n: number() },
  output: number(),
  plain: true,
  run: ({ input }) => round(input.n),
})
