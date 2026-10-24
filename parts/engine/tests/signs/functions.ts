import { action, anyone, boolean, change, fail, input, sessions, text } from 'tentjs'
import { users } from './tables.ts'

const open = anyone('a test signs in')

export const addUser = change('addUser', {
  access: 'nobody',
  input: { email: text() },
  set: users.add({ email: input('email'), roles: [] }),
})

export const signIn = action('signIn', {
  access: open,
  system: 'finds the user that signs in',
  input: { email: text(), for: text({ optional: true }), browserOnly: boolean({ default: false }) },
  run: async ({ input: given, db }) => {
    const user = await db.system.users.where({ email: given.email }).first()
    if (!user) return fail('unknown', 'No user has that email.')
    sessions.start(user.id, { ...(given.for === undefined ? {} : { for: given.for }), browserOnly: given.browserOnly })
  },
})

export const signInWrite = change('signInWrite', {
  access: open,
  system: 'finds the user that signs in',
  input: { email: text(), undo: boolean({ default: false }) },
  run: ({ input: given, db }) => {
    const user = db.system.users.where({ email: given.email }).first()
    if (!user) return fail('unknown', 'No user has that email.')
    sessions.start(user.id)
    if (given.undo) fail('undone', 'The write is undone after the session was started.')
  },
})

export const signOut = action('signOut', { access: open, run: async () => sessions.end() })
