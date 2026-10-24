import { list, project, table, text } from 'tentjs'

export const rememberSealed = project('rememberSealed', {})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

// Codes kept stored encrypted, which every caller who is signed in reads alike.
export const codes = table('codes', {
  columns: { code: text({ sealed: true }) },
  access: { read: 'signedIn', add: 'signedIn' },
})
