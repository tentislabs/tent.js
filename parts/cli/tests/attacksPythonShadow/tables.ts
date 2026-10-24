import { list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const notes = table('notes', {
  columns: { body: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})
