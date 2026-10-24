# A code by mail

A code is kept `sealed`, so a copy of the data shows nothing of it, and is compared with `sameSecret`. It is good for ten minutes and is used once.

```ts
// tables/signInCodes.ts
import { date, table, text } from 'tentjs'

export const signInCodes = table('signInCodes', {
  columns: { email: text({ personal: true }), code: text({ sealed: true, private: true }), until: date() },
  access: { read: 'nobody', add: 'nobody', change: 'nobody', remove: 'nobody' },
})
```

```ts
// functions/codes.ts
import { action, anyone, attempts, change, date, fail, later, link, mail, now, sameSecret, sessions, text, token } from 'tentjs'

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
  access: anyone('a visitor asks for a code'),
  system: 'mails a code to an email, whether it has an account or not',
  input: { email: text({ max: 254 }) },
  run: async ({ input, call }) => {
    const email = input.email.trim().toLowerCase()
    attempts.limit(`code:${email}`, { tries: 3, per: '10 minutes' })
    const code = token({ digits: 6 })
    call(keepCode, { email, code, until: later(now(), '10 minutes') })
    await mail.send({ to: email, subject: 'Your code', text: `Your code is ${code}. It works for ten minutes.` })
  },
})

export const signInWithCode = action('signInWithCode', {
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
```
