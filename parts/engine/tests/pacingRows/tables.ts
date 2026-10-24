import { number, project, table, text } from 'tentjs'

export const pacingRows = project('pacingRows', {})

// Each table starts one flow when a row of it changes: its flow states no key, so it is paced for each row.
export const throttledRows = table('throttledRows', { columns: { name: text() }, access: { read: 'signedIn' } })
export const droppedRows = table('droppedRows', { columns: { name: text() }, access: { read: 'signedIn' } })
export const batchedRows = table('batchedRows', { columns: { name: text() }, access: { read: 'signedIn' } })
export const rankedRows = table('rankedRows', {
  columns: { name: text(), rank: number() },
  access: { read: 'signedIn' },
})

// What the work of a step leaves behind, so that a test counts how often it was done.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})
