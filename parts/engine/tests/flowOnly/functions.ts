import { change, flow, input, text } from 'tentjs'
import { notes } from './tables.ts'

// A flow and nothing that reaches outside: no service, no worker, no model.
export const addNote = change('addNote', {
  access: 'anyone',
  input: { words: text() },
  set: notes.add({ words: input('words') }),
})

export const onNote = flow('onNote', {
  on: notes.added(),
  run: async ({ step }) => {
    await step('note', () => 'noted')
  },
})
