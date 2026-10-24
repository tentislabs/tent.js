import {
  action,
  anyone,
  attempts,
  change,
  date,
  fail,
  later,
  link,
  mail,
  now,
  object,
  sameSecret,
  sessions,
  text,
  token,
} from 'tentjs'

export const keepCode = change('keepCode', {
  access: 'nobody',
  system: 'only a sign-in by mail keeps its codes',
  input: { email: text(), code: text(), until: date() },
  run: ({ input, db }) => {
    for (const old of db.system.signInCodes.where({ email: input.email }).all()) db.system.signInCodes.remove(old.id)
    db.system.signInCodes.add(input)
  },
})

export const useCode = change('useCode', {
  access: 'nobody',
  system: 'only a sign-in by mail uses its codes',
  input: { code: link('signInCodes') },
  run: ({ input, db }) => {
    db.system.signInCodes.remove(input.code)
  },
})

export const sendCode = action('sendCode', {
  about: 'Mails a code of sign-in to an email',
  access: anyone('a visitor asks for a code'),
  system: 'mails a code to an email, whether it has an account or not',
  input: { email: text({ max: 254 }) },
  output: object({ email: text() }),
  run: async ({ input, call }) => {
    const email = input.email.trim().toLowerCase()
    attempts.limit(`code:${email}`, { tries: 3, per: '10 minutes' })
    const code = token({ digits: 6 })
    call(keepCode, { email, code, until: later(now(), '10 minutes') })
    await mail.send({ to: email, subject: 'Your code', text: `Your code is ${code}. It works for ten minutes.` })
    return { email }
  },
})

export const signInWithCode = action('signInWithCode', {
  about: 'Signs a person in with the code that was mailed to them',
  access: anyone('a visitor signs in with a code'),
  system: 'reads the codes and the users, which nobody may read',
  input: { email: text({ max: 254 }), code: text({ secret: true }) },
  run: async ({ input, db, call }) => {
    const email = input.email.trim().toLowerCase()
    attempts.limit(`signInWithCode:${email}`, { tries: 5, per: '10 minutes', address: true })
    const kept = await db.system.signInCodes.where({ email }).first()
    const user = await db.system.users.where({ email }).first()
    if (!kept || !user || kept.until.getTime() < now().getTime() || !sameSecret(kept.code, input.code))
      return fail('wrong-code', 'That code is not right, or no longer works.')
    call(useCode, { code: kept.id })
    sessions.start(user.id)
  },
})

export const signOut = action('signOut', {
  about: 'Signs the person out',
  access: 'signedIn',
  run: async () => {
    sessions.end()
  },
})
