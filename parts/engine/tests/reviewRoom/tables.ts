import { project, table, text } from 'tentjs'

export const reviewRoom = project('reviewRoom', {
  limits: { queryTime: '3 seconds', actionTime: '2 seconds' },
})

export const notes = table('notes', {
  columns: { what: text() },
  access: { read: 'anyone', add: 'anyone' },
})
