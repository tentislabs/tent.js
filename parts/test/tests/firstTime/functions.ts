import { anyone, change, list, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// Nobody may call it from outside: `identify` calls it, for a person who comes for the first time.
export const welcome = change('welcome', {
  access: 'nobody',
  input: { email: text() },
  output: text(),
  run: ({ input: given, db }) => db.users.add({ email: given.email, roles: [] }).id,
})

export const whoAmI = query('whoAmI', {
  access: anyone('a test looks who it is'),
  output: text(),
  run: ({ user }) => user?.id ?? 'nobody',
})
