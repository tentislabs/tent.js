import { boolean, link, list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const notes = table('notes', {
  columns: { title: text(), done: boolean({ default: false }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

// A tag holds its note: a note that a tag links to cannot be removed.
export const tags = table('tags', {
  columns: { note: link('notes'), word: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})
