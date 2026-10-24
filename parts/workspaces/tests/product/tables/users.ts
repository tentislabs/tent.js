import { list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text(), roles: list(text()) },
  access: { read: 'owner' },
})
