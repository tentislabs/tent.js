# `passwords`

Hashes a password and checks one against what was stored, for a sign-in of the project's own. The method is Argon2id, which the runtime has built in.

## Example

```ts
import { action, anyone, change, passwords, sessions, text } from 'tentjs'

export const addUser = change('addUser', {
  access: 'nobody',
  system: 'only a sign-up makes a user',
  input: { email: text(), password: text() },
  output: text(),
  run: ({ input, db }) => db.system.users.add({ email: input.email, password: input.password, roles: [] }).id,
})

export const signUp = action('signUp', {
  access: anyone('a visitor makes an account'),
  system: 'makes the user of whoever signs up',
  input: { email: text(), password: text({ secret: true }) },
  run: async ({ input, call }) => {
    call(addUser, { email: input.email, password: await passwords.hash(input.password) })
  },
})

export const signIn = action('signIn', {
  access: anyone('a sign-in is open to every visitor'),
  system: 'reads the user that signs in, whom nobody may read yet',
  input: { email: text(), password: text({ secret: true }) },
  run: async ({ input: given, db }) => {
    const user = await db.system.users.where({ email: given.email }).first()
    if (!user?.password || !(await passwords.check(given.password, user.password))) return
    sessions.start(user.id)
  },
})
```

The user is written through a change whose rule is `'nobody'`, which the sign-up reaches with `call`: so nothing from outside writes a user, nor the stored text of a password. The column that holds the stored text is `text({ private: true })`, so that no rule of the table hands it out. `topic.signIn` writes a whole sign-in this way.

## Members

| Member | Answers |
|---|---|
| `passwords.hash(text)` | A promise of the text to store: `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`. Each call draws a salt of its own, so the same password gives another text every time |
| `passwords.check(text, stored)` | A promise of whether `text` is the password of the stored text. It checks by the settings that the stored text names, so a text made before a setting was raised still checks. A text that is no stored password checks false |
| `passwords.old(stored)` | At once: whether the stored text was made with other settings than today's. A sign-in that just checked the password then stores a new one |

The settings are `limits.passwordMemory` and `limits.passwordPasses` of the project: 19 MB of memory and 2 passes where none is stated, with one lane, a salt of 16 random bytes and a result of 32. `hash` and `check` take some tens of milliseconds and answer promises, so they are for an action, a route and a step of a flow.

A sign-in also bounds how often a password may be guessed: see `handle.attempts`.

## Errors

`code.T0013` when `hash` or `check` is used in a query or a change, which wait for nothing.

## See also

`handle.sessions`, `handle.attempts`, `topic.signIn`, `topic.users`, `option.project.limits`
