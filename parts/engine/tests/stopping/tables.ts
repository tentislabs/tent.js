import { project, table, text } from 'tentjs'

export const stopping = project('stopping', {})

// What the work of a step leaves behind, so that a test counts how often it was done.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})
