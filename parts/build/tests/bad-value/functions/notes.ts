import { allow, change, input, number, query, random, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text(), n: number() }, access: { read: 'signedIn' } })

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { body: text() },
  set: notes.add({ body: input('body'), n: 1 }),
})

export const byWord = query('byWord', {
  access: 'signedIn',
  input: { n: number() },
  output: number(),
  run: () => input('n'),
})

export const byRule = query('byRule', {
  access: allow((user, given: { body: string }) => addNote({ body: given.body }) !== undefined),
  input: { body: text() },
  rows: notes.limit(5),
})

export const drawn = query('drawn', {
  access: allow(() => random() > 0.5),
  rows: notes.limit(5),
})
