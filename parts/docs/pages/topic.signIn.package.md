# A sign-in from a package

A package that proves who a person is - by its own form, by a provider, by a token it signs - hands the person to the engine in one of two ways.

**A function calls `sessions.start(user)`** once the package has said who it is, as `signIn` above does once the password fits: the package's own answer takes the place of `passwords.check`.

**`identify` reads the package's own token** from each request and names the user. It is asked where nothing else named one: no session, no key and no token of a program. Here a package signs a cookie `acme_token` with a key kept as a secret:

```ts
// tent.ts
import { project, secrets } from 'tentjs'
import { readToken } from '@acme/tokens'

export const shop = project('shop', {
  title: 'Shop',
  identify: async ({ request }) => {
    const token = /(?:^|;\s*)acme_token=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1]
    return token === undefined ? undefined : readToken(token, secrets.TOKEN_KEY.reveal())
  },
})
```

`identify` answers the id of a row of `users`, or nothing for a stranger. The roles are those of that row. `call(fn, input)`, which it is handed, makes the row of a person seen for the first time.

## What is yours

What a sign-in of your own does wrong is yours: the engine holds what it gives - a session that cannot be guessed or taken from a copy of the data, a password stored as its hash, a count that a failed call does not undo - and the code around it is the project's own, as every other line of it.

## See also

- `handle.sessions`
- `handle.passwords`
- `handle.attempts`
- `word.token`
- `word.sameSecret`
- `option.project.identify`
- `option.project.signInPath`
- `topic.users`
