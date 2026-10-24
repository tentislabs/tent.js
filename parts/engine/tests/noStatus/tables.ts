import { list, project, table, text } from 'tentjs'

export const noStatus = project('noStatus', { backups: { every: false } })

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})
