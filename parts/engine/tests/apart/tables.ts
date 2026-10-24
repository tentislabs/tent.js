import { project, table, text, where } from 'tentjs'

export const apart = project('apart', {
  limits: { queryTime: '1 second', changeTime: '1 second', actionTime: '5 seconds' },
})

// What the code of the project writes: each row by whom it was written.
export const notes = table('notes', {
  columns: { what: text(), by: text({ optional: true }) },
  access: { read: 'anyone', add: 'anyone', change: 'anyone', remove: 'anyone' },
})

// A table whose rule of reading is code: a row is read by the one it is for alone.
export const letters = table('letters', {
  columns: { to: text(), body: text() },
  access: { read: where((user) => ({ to: user?.id ?? 'nobody' })), add: 'anyone' },
})
