import { link, list, project, table, text } from 'tentjs'

export const working = project('working', {
  workers: {
    gpu: { about: 'A machine with a graphics card' },
    locked: { about: 'A machine that is handed only what the writer can hold it to', systemWork: false },
  },
})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

// What the work of a task leaves behind, so that a test sees what was written.
export const marks = table('marks', {
  columns: { what: text(), by: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn' },
})

// A note that its owner alone reads: the rows of each entry of a batch are read as the caller of that entry.
export const notes = table('notes', {
  columns: { title: text(), owner: link('users') },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn' },
})
