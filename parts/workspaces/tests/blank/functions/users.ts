import { anyone, caller, change, input, query, text } from 'tentjs'
import { notes, users } from '../tables/users'

export const addUser = change('addUser', {
  about: 'Adds a user of the app',
  input: { email: text() },
  access: 'nobody',
  system: 'the user of a workspace is added by the product',
  set: users.add({ email: input('email'), roles: [] }),
})

export const whoAmI = query('whoAmI', {
  about: 'The row of the caller',
  access: 'signedIn',
  rows: users.where({ id: caller('id') }).first(),
})

export const allNotes = query('allNotes', {
  about: 'Every note',
  access: anyone('the notes of a test app'),
  rows: notes.newest('createdAt').limit(100),
})

export const addNote = change('addNote', {
  about: 'Adds a note',
  input: { body: text({ max: 200 }) },
  access: anyone('the notes of a test app'),
  set: notes.add({ body: input('body') }),
})
