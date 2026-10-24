# `keys`

The keys of programs: how a program is a caller, at a call, a read, the live connection, a file, a route and the API.

## Example

```ts
import { action, json, keys, text } from 'tentjs'

// A user makes a key for a script of their own: it is that user, narrowed to one report.
export const makeReportKey = action('makeReportKey', {
  access: 'signedIn',
  system: 'makes a key for the caller alone',
  input: { name: text() },
  output: json(),
  run: async ({ input, user }) => keys.add({ name: input.name, user: user?.id, scopes: ['monthlyTotals'], for: '90 days' }),
})
```

From the terminal, on the app of this computer:

```
tent access key add reports --scopes monthlyTotals,openOrders --roles staff --per-minute 120 --for "90 days"
tent access key add maya-laptop --user 01hx9k... --scopes "*"
tent access key list
tent access key remove <id>
```

## Members

| Member | Does |
|---|---|
| `keys.add({ name, scopes, roles, user, perMinute, for, asks, rights, work })` | Makes a key and answers `{ id, key }`. The key is shown this once: the data keeps the fingerprint of its random part and nothing else |
| `keys.list({ user })` | Every key, or those made for one user: `[{ id, name, scopes, roles, user, perMinute, asks, createdAt, lastUsedAt, expiresAt }]`. It never holds a key |
| `keys.remove(id)` | Removes a key: from then on it is nobody |

The handle is full access: a function that uses it states `system` and carries the rule itself. It answers at once, and writes, so it works where a change or an action does.

**The form of a key**: `tent_`, the id of the key, an underscore, and 32 random bytes in the 43 characters of base64 that are safe in an address. It is sent as `Authorization: Bearer <key>`, and nowhere else.

**What it carries.** `scopes`: the names of the functions, offered flows, agents and routes it may reach, `'files'`, or `'*'` for all of them; one outside them is `code.T3101`, wherever it is asked. They hold at the call that came through the door, and not for what that function calls from code. `roles`: the roles it has to a rule. `user`: a key made for a user is that user, with the roles that user has today, and takes no `roles` of its own. `perMinute`: its count of calls, 600 when left out. `for`: a length of time, after which it is nobody. `asks: 'none'`: it needs no person for a function that states `danger: 'ask'`.

To a rule a key is signed in, has its roles, and owns nothing, but the key of a user, which is that user. A key is nobody at a screen, at `/_t/screen` and at `/_t/form/`, unless it holds the scope `'screens'`, which `'*'` does not name; and at `/_t/connect/` it is nobody. Without the scope `'files'` it uploads only with `&for=` naming a function of its scopes, and downloads only its own loose files, a file that a call answered it among them. A program opens `/_t/live` with a key and no `Origin`, on a request that carries no cookie of the engine. `lastUsedAt` is written once a minute at most.

## Errors

`code.T0013` in a function that states no `system`, and for `sessions.start` under a key: a key has no browser. `code.T0002` for a field of `keys.add` that does not fit, a `user` beside `roles` among them. `code.T3101` for what a key's scopes do not name, and for a run that a key started, once the key is removed. `code.T0005` past its `perMinute`. `code.T7120` for a function that asks a person.

## See also

`command.access`, `option.project.api`, `code.T7120`
