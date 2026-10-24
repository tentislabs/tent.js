import { fail, object, query, text } from 'tentjs'

// A query that says no with a code of the app's own, as a builder writes a row that is not there.
export const findThing = query('findThing', {
  access: 'anyone',
  input: { id: text() },
  output: object({ name: text() }),
  run: ({ input }) => (input.id === 'here' ? { name: 'A thing' } : fail('not-found', 'There is no such thing.')),
})
