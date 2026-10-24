import { project, table, text } from 'tentjs'

export const seam = project('seam', {})

// What the code of the project writes, so that a call through the room is seen to reach the data.
export const notes = table('notes', {
  columns: { what: text() },
  access: { read: 'anyone', add: 'anyone' },
})
