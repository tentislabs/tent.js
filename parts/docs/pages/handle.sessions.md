# `sessions`

The sessions of the users of an app: `sessions.start` signs a browser in, and `sessions.end` signs it out. The engine holds no way to sign in: a sign-in is a function of the project that proves who someone is, and then starts a session.

## Example

```ts
import { action, anyone, fail, passwords, sessions, text } from 'tentjs'

export const signIn = action('signIn', {
  access: anyone('a sign-in is open to every visitor'),
  system: 'reads the user that signs in, whom nobody may read yet',
  input: { email: text(), password: text({ secret: true }) },
  run: async ({ input, db }) => {
    const user = await db.system.users.where({ email: input.email }).first()
    if (!user || !(await passwords.check(input.password, user.password))) return fail('wrong', 'Wrong email or password.')
    sessions.start(user.id)
  },
})

export const signOut = action('signOut', { access: 'signedIn', run: async () => sessions.end() })
```

A screen calls them as it calls any function, with `call=` or `useCall`. After the call the page shows its screen again as the new caller, in place: no address is loaded anew.

## Members

| Member | Does |
|---|---|
| `sessions.start(user, { for, browserOnly })` | Starts a session for the user, by the id of the row of `users` or by the row, and hands the browser its cookie. It always makes a new session: the one the request came with is ended. `for` is another life than `limits.sessionTime` for this one session, as `'30 minutes'`, and `browserOnly: true` a cookie that ends with the browser. It answers nothing |
| `sessions.end(id?)` | Ends the session of the request and takes its cookie away. With an `id` of `sessions.list` it ends that session of the caller's own, and of any user in code with full access |
| `sessions.endAll(user)` | Ends every session of that user, the one of the request among them: "sign out everywhere". The caller's own user, and any other in code with full access |
| `sessions.list(user)` | The sessions of that user that stand, the oldest first: `[{ id, createdAt, usedAt, current }]`, where `current` marks the session of the request. It is a read, so a query may call it, and shows "your devices". The caller's own user, and any other in code with full access |

**Where they work.** `start` and `end` work where a request of a browser is being answered: in a change, an action or a route that a page called. In a change the session is part of the write, so a change that is undone leaves no session and no cookie. In an action the session stands also where the action fails afterwards. `endAll` and `list` work in any call.

**The cookie.** It is named `tent_session.<the app's name>`, and over https `__Host-tent_session.<the app's name>`. The scripts of a page cannot read it, it is sent to this site alone, and it is marked `Secure` over https. The data keeps the fingerprint of its bytes and never the bytes, so a copy of the data signs nobody in. `option.project.cookies` changes two of its marks.

**How long a session lasts.** `limits.sessionTime` of the project from its last use, 30 days where none is stated. A user holds `limits.sessionsPerUser` sessions, 20 where none is stated: one more ends the one that was used longest ago.

**The caller of the next request** is the user of the session, read from `users` as the row is then: the roles are those of today, and a user whose row is gone is nobody. A page that was drawn for another caller than the one its next call has is told so, with `"caller": "changed"` in the answer, and asks for its screen again before anything else.

**In a test** a session needs a browser: `app.browser()` of `topic.tests.noBrowser` keeps the cookie that a sign-in hands it.

## Errors

`code.T0013` when `start` or `end` is used where no request of a browser is being answered: under `app.call`, in a step of a flow, in a call that a key made. Also when `endAll` or `list` names another user than the caller in code that states no `system`.

`code.T2103` when `start` names a user that no row of `users` has, and `code.T0014` when the app has no `users` table.

`code.T0027` when `for` is no length of time.

## See also

`topic.users`, `topic.tests`, `option.project.cookies`, `option.project.identify`, `option.project.limits`
