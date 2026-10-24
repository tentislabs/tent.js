import { change, input, list, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// What the work of a step leaves behind, so that a test sees what was done.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

// The last work of a run of an agent runs as its starter, who adds a mark.
export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })
