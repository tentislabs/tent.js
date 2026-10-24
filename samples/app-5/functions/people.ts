import { action, anyone, attempts, fail, link, object, passwords, query, sessions, text } from 'tentjs'

export const signIn = action('signIn', {
  about: 'Signs the person in by their email and password',
  access: anyone('a visitor signs in'),
  system: 'reads the user of an email, whom nobody may read yet',
  input: { email: text({ max: 254 }), password: text({ max: 200, secret: true }) },
  run: async ({ input, db }) => {
    const email = input.email.trim().toLowerCase()
    attempts.limit(`signIn:${email}`, { tries: 5, per: '10 minutes', address: true })
    const user = await db.system.users.where({ email }).first()
    if (!user?.password || !(await passwords.check(input.password, user.password)))
      return fail('wrong-sign-in', 'That email and password do not fit.')
    sessions.start(user.id)
  },
})

export const signOut = action('signOut', {
  about: 'Signs the person out',
  access: 'signedIn',
  run: () => {
    sessions.end()
  },
})

export const me = query('me', {
  about: 'The signed-in person: their name and email, for the mark at the foot of the sidebar',
  access: 'signedIn',
  output: object({ id: link('users'), name: text(), email: text() }, { optional: true }),
  run: ({ db, user }) => {
    const row = user ? db.users.get(user.id) : undefined
    return row ? { id: row.id, name: row.name ?? '', email: row.email } : undefined
  },
})
