# A sign-in

The engine holds no sign-in of its own: a function checks the password with `passwords.check`, counts the tries with `attempts.limit`, and starts a session with `sessions.start`. `topic.signIn` writes a whole one, with a sign-up, a code by mail and signing out.

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
    const user = await db.system.users.where({ email }).first()
    if (!user?.password || !(await passwords.check(input.password, user.password)))
      return fail('wrong-sign-in', 'That email and password do not fit.')
    sessions.start(user.id)
  },
})
```

A `Form` sends what its named fields hold as the input of its function, checks it against the types of that input before it calls, and sends with no script too. `then` says what follows a send that worked: here `goTo`, the address the visitor came from, written as a path of the app. A failure, as a wrong password, is shown by the form after its last field.

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
