import { action, anyone, attempts, boolean, fail, object, passwords, sessions, text } from 'tentjs'

export const signIn = action('signIn', {
  about: 'Signs a person in with their email and password, and says whether they are staff',
  access: anyone('a visitor signs in'),
  system: 'reads the user of an email, whom nobody may read yet',
  input: { email: text({ max: 254 }), password: text({ max: 200, secret: true }) },
  output: object({ staff: boolean() }),
  run: async ({ input, db }) => {
    const email = input.email.trim().toLowerCase()
    attempts.limit(`signIn:${email}`, { tries: 5, per: '10 minutes', address: true })
    attempts.limit(`signIn:${email}`, { tries: 50, per: '1 hour' })
    const user = await db.system.users.where({ email }).first()
    if (!user?.password || !(await passwords.check(input.password, user.password)))
      return fail('wrong-sign-in', 'That email and password do not fit.')
    attempts.clear(`signIn:${email}`, { address: true })
    sessions.start(user.id)
    return { staff: user.roles.includes('staff') }
  },
})

export const signOut = action('signOut', {
  about: 'Signs the browser out',
  access: 'signedIn',
  run: async () => {
    sessions.end()
  },
})
