import { table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { what: text() },
  access: { read: 'anyone', add: 'anyone' },
})
