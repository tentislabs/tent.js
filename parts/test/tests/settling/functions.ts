import { change, input, query, table, text } from 'tentjs'

// What the work of a step leaves behind, so that a test sees what was done.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn' },
})

export const addMark = change('addMark', {
  access: 'nobody',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })
