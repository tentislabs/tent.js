import { boolean, list, number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

const NONE = ['none']

export const untagged = query('untagged', {
  access: 'signedIn',
  input: { tags: list(text()) },
  output: boolean(),
  run: ({ input }) => input.tags == NONE,
})
