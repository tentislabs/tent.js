import { project, table, text } from 'tentjs'

export const pacing = project('pacing', {})

// A row whose changes start a flow that is paced.
export const orders = table('orders', {
  columns: { name: text() },
  access: { read: 'signedIn' },
})

// What the work of a step leaves behind, so that a test counts how often it was done.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})
