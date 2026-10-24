# `connections`

The accounts that users connected at a service whose auth is `oauth`: "connect your account". A call of such a service runs with the account of the user it runs as, after that user agreed at the provider.

## Example

```ts
import { action, connections, query, json, text } from 'tentjs'
import { github } from '../services/github'

// A button of a screen calls this, and its `then` goes to the address it answers with `href`.
export const connectGithub = action('connectGithub', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => connections.start(github, { back: '/settings' }),
})

// A live query: the screen shows "connected" from it.
export const myConnections = query('myConnections', {
  access: 'signedIn',
  input: {},
  output: json(),
  run: () => connections.list(),
})

export const myIssues = action('myIssues', { access: 'signedIn', input: {}, output: json(), run: async () => github.listIssues({}) })
```

The service names the builder's own registration with the provider:

```ts
export const github = service('github', {
  url: 'https://api.github.com',
  auth: { oauth: { authorizeUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token',
                     clientId: secret('GITHUB_ID'), clientSecret: secret('GITHUB_SECRET'), scopes: ['repo'] } },
  calls: { listIssues: get('/user/issues', { input: {}, sends: false }) },
})
```

Register `https://<your app>/_t/connect/github` with the provider, under each name the app answers on.

## Members

| Member | Does |
|---|---|
| `connections.start(service, { back, account })` | Answers, at once, the address of the provider to send the user to. It works for every caller that is a user: in a browser, with a key that was made for a user, with a token. `back` is a path of the app, `/` where it is left out; `account` names one of several accounts of the user, the empty name where it is left out |
| `connections.list(user?)` | The caller's own connections: `[{ service, account, scopes, at }]`, `at` being when it was first made. It is a read, so a query may call it, and the query is live. Code with full access may name another user |
| `connections.end(service, { account, user })` | Removes a connection of the caller's own, or of a user that code with full access names. Where the service states `revokeUrl` the tokens are posted there first and it answers a promise, so it works in an action or a route; otherwise it is part of the write of the change it is used in |

**The state travels with the user, and is kept nowhere.** The address carries one text that holds the user, `back`, the proof of the standard (PKCE, with SHA-256), the name the app was reached by and the time, encrypted with the key of the secrets. It is good for `limits.connectTime` (10 minutes). The return writes the connection and sends the browser to `back`. Where anything fails, nothing is written, and the browser is sent to `back` with `connect=failed` after the question mark, or `connect=refused` where the user refused at the provider; to `/` where the state did not open for this user. A caller who is nobody at the return is sent to `signInPath` first.

**The connection** is one row for a service, a user and an account. Its tokens are encrypted, bound to the mode, the service and the user, so a row copied to another user opens nothing. A token that ends within a minute is renewed before a call, one renewal at a time for a connection; an answer of 401 causes one renewal and one more try; a renewal that the provider refuses removes the connection. A call names its account as `github.listIssues(input, { account: 'work' })`. Code with full access works with the account of another user: `github.listIssues(input, { for: userId })`, which is how a run of the system works through every user's account. A person's removal removes their connections.

## Errors

`code.T7117` for a call for no user, or for a user with no connection. `code.T0006` for `start` by a caller who is nobody, and `code.T0013` for one that is no user, and for `for` or another user in code without full access. `code.T0002` for a `back` that is no path of the app. `code.T7115` where a renewal gets no answer.

## See also

`word.service`, `option.service.auth`, `option.service.connection`
