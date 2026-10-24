import { between, boolean, date, number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const isNow = query('isNow', {
  access: 'signedIn',
  input: { at: date() },
  output: boolean(),
  run: ({ input, now }) => between(input.at, now, 'ms') == 0,
})
