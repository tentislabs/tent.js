import { change, role, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

export const addNote = change('addNote', {
  access: role('staff'),
  input: { body: text() },
  run: ({ db, input }) => {
    db.system.notes.add({ body: input.body })
  },
})
