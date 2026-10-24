# `grants`

What people allowed programs: each grant a person gave a chat app or the app's own command line in the browser, so that a builder can show "programs that act for you" and end one.

## Example

```ts
import { action, date, grants, list, object, query, text } from 'tentjs'

export const myGrants = query('myGrants', {
  access: 'signedIn',
  output: list(object({ id: text(), client: text(), name: text(), scopes: list(text()), for: text(), createdAt: date(), usedAt: date() })),
  run: () => grants.list(),
})

export const endGrant = action('endGrant', {
  access: 'signedIn',
  input: { id: text() },
  run: async ({ input }) => grants.end(input.id),
})
```

## Members

| Member | Does |
|---|---|
| `grants.list()` | The caller's own grants, at once: `[{ id, client, name, scopes, for, createdAt, usedAt, reusedAt }]`. `client` is the id the program named itself by, `name` the name it showed, `for` is `'mcp'` or `'app'`, and `reusedAt` stands where a renewal token was used twice. It holds nothing of a token |
| `grants.list(user)` | The grants of any user, in code with full access |
| `grants.end(id)` | Ends one of the caller's own grants: its tokens are nobody from then on. With full access it ends any. An id that is no grant of the caller's ends nothing |

`list` is a read, so a query may call it, with an `output`. `end` writes, so it works in a change and in an action. A person's removal ends their grants; signing out ends none, and neither does the end of an outside login that `identify` rests on: there the builder's own code ends them with `grants.end`.

**How a grant is made.** A program sends the person to `/_t/oauth/authorize`; the person signs in at the project's `signInPath` and is asked on a page, the engine's own or a screen of the builder's that states `for: 'grant'`; the program changes the code it is sent back with for an access token, good for `limits.tokenTime` (1 hour), and a renewal token, good for `limits.grantTime` (30 days) from its last use. The data keeps the fingerprints of the tokens and nothing that opens them. `topic.mcp.signIn` says each step.

## Errors

`code.T0013` for `grants.list(user)` of another user in code that states no `system`, and for `grants.end` in a query.

## See also

`topic.mcp`, `option.project.mcp`, `handle.keys`
