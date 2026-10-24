import { change, number, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const size = query('size', {
  access: 'signedIn',
  output: number(),
  run: async ({ db }) => db.notes.count(),
})

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { body: text() },
  run: async ({ input, db }) => {
    db.notes.add({ body: input.body, n: 1 })
  },
})
