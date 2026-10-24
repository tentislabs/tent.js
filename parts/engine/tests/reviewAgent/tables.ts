import { list, project, table, text } from 'tentjs'

export const reviewAgent = project('reviewAgent', {})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'owner' },
})
