import { list, table, text } from 'tentjs'

export const users = table('users', {
  columns: {
    email: text({ unique: true, personal: true }),
    roles: list(text(), { default: [] }),
  },
  access: { read: 'owner' },
})
