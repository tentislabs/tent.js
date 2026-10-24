import { list, number, project, table, text } from 'tentjs'

export const flowAttacks = project('flowAttacks', {
  limits: { actionTime: '400 ms' },
})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

// A table whose pay no caller may be handed, whoever reads it.
export const staff = table('staff', {
  columns: { name: text(), pay: number({ private: true }) },
  access: { read: 'signedIn' },
})

// What the work of a step leaves behind, so that a test counts how often it was done.
export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'anyone', add: 'anyone' },
})
