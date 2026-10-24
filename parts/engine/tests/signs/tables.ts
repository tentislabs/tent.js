import { list, project, table, text } from 'tentjs'

export const signs = project('signs', {})

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})
