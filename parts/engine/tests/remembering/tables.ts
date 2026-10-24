import { link, list, project, table, text } from 'tentjs'

export const remembering = project('remembering', {})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

// A note that its owner alone reads: what work reads of it answers each caller otherwise.
export const notes = table('notes', {
  columns: { title: text(), owner: link('users') },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn', remove: 'owner' },
})

// Marks that every caller who is signed in reads alike.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn', add: 'signedIn', remove: 'signedIn' },
})
