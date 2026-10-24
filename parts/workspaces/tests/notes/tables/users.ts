import { anyone, list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text(), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { body: text({ max: 200 }) },
  access: { read: anyone('the notes of a test app'), add: anyone('the notes of a test app') },
})
