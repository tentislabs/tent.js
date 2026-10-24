# Signing people in

The engine holds no way to sign in of its own. It gives the pieces - sessions, passwords, a count of tries, codes and mail - and a sign-in is ordinary code of the project that proves who a person is and then starts a session. This page writes one with a password, a limit on tries, a code by mail and signing out, and shows how a sign-in that a package gives hands its person to the engine.

## What the engine gives

| Piece | Does |
|---|---|
| `sessions.start(user)` | Starts a session for a row of `users`, in a cookie that scripts cannot read: from then on the browser is that user. In a change or an action that a browser called |
| `sessions.end()`, `sessions.endAll(user)`, `sessions.list(user)` | Ends the session of the request; ends every session of a user; lists them, for a screen of "your devices" |
| `passwords.hash(text)`, `passwords.check(text, stored)`, `passwords.old(stored)` | Makes the text to store for a password, checks one against it, and says whether it was made with older settings |
| `attempts.limit(key, { tries, per, address })`, `attempts.clear(key)` | Counts one try of a key and fails with `code.T0005` past the bound; empties the count after a sign-in that worked |
| `token({ digits })`, `sameSecret(a, b)` | A random code, and a comparison of two secrets that takes as long whatever they hold |
| `mail.send(...)` | Sends a mail, as a code by mail needs |
| `identify` of `project` | Reads a token or a cookie of your own, or of a package, from each request and names the user |

From the moment a session starts, `access: 'signedIn'`, `role(...)`, the rules of rows and every handle see that user, whichever way they were signed in.

## The project and its people

The project names the screen of the sign-in, which a stranger is sent to from a screen that needs one. Who may make an account is the code of your sign-up alone, and a rule of `'signedIn'` is worth what it lets in: where anyone may sign up, it lets in anyone who cares to.

```ts
// tent.ts
import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  signInPath: '/sign-in',
  mail: { from: 'hello@example.com' },
})
```

The engine reads `id` and `roles` of each row of `users`. The rest is yours: here an email, a name, and the stored password, which no rule lets anyone read.

```ts
// tables/users.ts
import { list, table, text } from 'tentjs'

export const users = table('users', {
  columns: {
    email: text({ unique: true, personal: true }),
    name: text({ optional: true, personal: true }),
    password: text({ optional: true, private: true }),
    roles: list(text()),
  },
  access: { read: 'owner' },
})
```

## Signing up

A visitor's function states who may call it and why it needs `system`, and writes through a change whose rule is `'nobody'`, which it reaches with `call`: so nothing from outside writes a user.

```ts
// functions/signUp.ts
import { action, anyone, attempts, change, fail, passwords, sessions, text } from 'tentjs'

export const addUser = change('addUser', {
  access: 'nobody',
  system: 'only a sign-up makes a user',
  input: { email: text(), name: text(), password: text() },
  output: text(),
  run: ({ input, db }) => {
    if (db.system.users.where({ email: input.email }).first()) fail('has-account', 'This email has an account: sign in.')
    return db.system.users.add({ email: input.email, name: input.name, password: input.password, roles: [] }).id
  },
})

export const signUp = action('signUp', {
  access: anyone('a visitor makes an account'),
  system: 'makes the user of whoever signs up',
  input: { email: text({ max: 254 }), name: text({ min: 1, max: 100 }), password: text({ min: 8, max: 200, secret: true }) },
  run: async ({ input, call }) => {
    attempts.limit('signUp', { tries: 10, per: '1 hour', address: true })
    const password = await passwords.hash(input.password)
    sessions.start(call(addUser, { email: input.email.trim().toLowerCase(), name: input.name, password }))
  },
})
```

## Signing in

The tries are counted before the password is checked, twice: by the email and the address, and by the email alone with a higher bound, so that guesses from many addresses run out too. The sixth wrong try within ten minutes fails with `code.T0005`, also for the right password.

```ts
// functions/signIn.ts
import { action, anyone, attempts, fail, passwords, sessions, text } from 'tentjs'

export const signIn = action('signIn', {
  access: anyone('a visitor signs in'),
  system: 'reads the user of an email, whom nobody may read yet',
  input: { email: text({ max: 254 }), password: text({ max: 200, secret: true }) },
  run: async ({ input, db }) => {
    const email = input.email.trim().toLowerCase()
    attempts.limit(`signIn:${email}`, { tries: 5, per: '10 minutes', address: true })
    attempts.limit(`signIn:${email}`, { tries: 50, per: '1 hour' })
    const user = await db.system.users.where({ email }).first()
    if (!user?.password || !(await passwords.check(input.password, user.password)))
      return fail('wrong-sign-in', 'That email and password do not fit.')
    attempts.clear(`signIn:${email}`, { address: true })
    sessions.start(user.id)
  },
})
```

The screen at `signInPath` is a `Form` over `signIn`. A stranger sent there from another screen comes with `back`, the address to go to afterwards:

```tsx
// screens/signIn.tsx
import { anyone, screen, text, Form } from 'tentjs/ui'
import { signIn } from '../functions/signIn'

export const signInScreen = screen('signInScreen', {
  path: '/sign-in',
  access: anyone('the way in is open to every visitor'),
  state: { back: { type: text({ default: '/' }), in: 'address' } },
  view: ({ state }) => (
    <main>
      <h1>Sign in</h1>
      <Form call={signIn} then={{ goTo: `/${state.back.replace(/^\/+/, '')}` }}>
        <label>
          Email <input name="email" type="email" autoComplete="username" />
        </label>
        <label>
          Password <input name="password" type="password" autoComplete="current-password" />
        </label>
        <button type="submit">Sign in</button>
      </Form>
    </main>
  ),
})
```

## Signing out

```ts
// functions/signOut.ts
import { action, sessions } from 'tentjs'

export const signOut = action('signOut', {
  access: 'signedIn',
  run: async () => {
    sessions.end()
  },
})

export const signOutEverywhere = action('signOutEverywhere', {
  access: 'signedIn',
  run: async ({ user }) => {
    if (user) sessions.endAll(user.id)
  },
})
```

A page whose session ended asks for its screen again before anything else, so it shows what a stranger sees.
