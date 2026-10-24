import { list, table, text } from 'tentjs'

export const users = table('users', {
  columns: {
    email: text({ unique: true, personal: true }),
    name: text({ optional: true, personal: true }),
    roles: list(text()),
  },
  access: { read: 'owner' },
})
