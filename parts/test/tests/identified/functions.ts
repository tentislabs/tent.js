import { action, anyone, list, number, query, sessions, table, text } from 'tentjs'
import { howOften } from './asked'

const open = anyone('a test looks who it is')

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { title: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const whoAmI = query('whoAmI', {
  access: open,
  output: text(),
  run: ({ user }) => user?.id ?? 'nobody',
})

export const allNotes = query('allNotes', { access: 'signedIn', rows: notes.oldest('title') })

// A query is not pure where it reads what a module keeps: an action tells how often `identify` was asked.
export const asked = action('asked', { access: open, output: number(), run: async () => howOften() })

export const signIn = action('signIn', {
  access: open,
  system: 'finds the user that signs in, whom nobody may read yet',
  input: { email: text() },
  run: async ({ input, db }) => {
    const user = await db.system.users.where({ email: input.email }).first()
    if (user) sessions.start(user.id)
  },
})
