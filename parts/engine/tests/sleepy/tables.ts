import { project, table, text } from 'tentjs'

export const sleepy = project('sleepy', {})

// What the work of a run leaves behind, so that a test sees that it was done.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'anyone', add: 'anyone' },
})
