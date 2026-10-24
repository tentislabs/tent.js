import { list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), email: text({ personal: true }), roles: list(text()) },
  access: { read: 'anyone' },
})
