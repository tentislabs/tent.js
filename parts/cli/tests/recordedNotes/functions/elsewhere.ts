import { action, number, query, text } from 'tentjs'
import { addNote } from './note'
import { notes } from '../tables/notes'

// A heavy query, carried out on a query thread.
export const heavyNotes = query('heavyNotes', { access: 'signedIn', heavy: true, rows: notes.where({}) })

// Work on a worker of the program, which calls a change of the writer.
export const noteOnGpu = action('noteOnGpu', {
  access: 'signedIn',
  worker: 'gpu',
  limits: { time: '1 minute' },
  input: { words: text() },
  output: number(),
  run: async ({ input }) => {
    await addNote({ words: input.words })
    return 1
  },
})
