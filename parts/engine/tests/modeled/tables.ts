import { list, project, table, text } from 'tentjs'

export const modeled = project('modeled', {})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})
