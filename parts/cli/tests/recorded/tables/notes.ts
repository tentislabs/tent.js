import { table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})
