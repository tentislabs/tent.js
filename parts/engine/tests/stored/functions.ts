import { action, anyone, change, fail, file, input, sessions, text } from 'tentjs'
import { notices, users } from './tables.ts'

const open = anyone('a test signs in')

export const addUser = change('addUser', {
  access: 'nobody',
  input: { email: text() },
  set: users.add({ email: input('email'), roles: [] }),
})

export const signIn = action('signIn', {
  access: open,
  system: 'finds the user that signs in',
  input: { email: text() },
  run: async ({ input: given, db }) => {
    const user = await db.system.users.where({ email: given.email }).first()
    if (!user) return fail('unknown', 'No user has that email.')
    sessions.start(user.id)
  },
})

export const keepPaper = change('keepPaper', {
  access: 'signedIn',
  input: { title: text(), paper: file() },
  run: ({ input: given, user, db }) => db.papers.add({ title: given.title, by: user.id, paper: given.paper }).id,
  output: text(),
})

export const post = change('post', {
  access: 'signedIn',
  input: { title: text(), picture: file() },
  set: notices.add({ title: input('title'), picture: input('picture') }),
})
