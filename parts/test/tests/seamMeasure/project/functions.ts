import { action, change, query, text } from 'tentjs'
import { notes } from './tables'

// A code query of one read.
export const oneRead = query('oneRead', {
  access: 'anyone',
  input: { id: text() },
  output: text(),
  run: ({ db, input }) => db.notes.get(input.id)?.what ?? '',
})

// A code change of one write.
export const oneWrite = change('oneWrite', {
  access: 'anyone',
  output: text(),
  run: ({ db }) => db.notes.add({ what: 'one' }).id,
})

// A code action that answers at once.
export const atOnce = action('atOnce', {
  access: 'anyone',
  output: text(),
  run: () => 'done',
})

// What the code screen reads.
export const newest = query('newest', {
  access: 'anyone',
  run: ({ db }) => db.notes.newest('createdAt').limit(20).all(),
})
