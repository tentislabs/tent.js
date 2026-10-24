# `tent access`

Prints one table of who can do what: the rule of every table for reading, adding, changing and removing, the rule of every function, every model with its provider, the policy of each agent that builds, and what the project opened with `unlock`. `tent access role` gives a user a role, and takes one away. `tent access key` makes, lists and removes the keys of programs.

## Usage

```
tent access [--data <folder>]
tent access role add <user id> <role> [--data <folder>]
tent access role remove <user id> <role> [--data <folder>]
tent access key add <name> [--scopes <names>] [--roles <names>] [--user <user id>] [--per-minute <n>] [--for <time>] [--asks none] [--data <folder>]
tent access key add <name> --right <rights> [--for <time>] [--data <folder>]
tent access key add <name> --right work [--kinds <names>] [--at-once <n>] [--workers <n>] [--for <time>] [--data <folder>]
tent access key list [--data <folder>]
tent access key remove <key id> [--data <folder>]
```

## Options

| Option | Means |
|---|---|
| `--data <folder>` | The data folder of the engine to ask. Left out, it is `.tent/` of the project |
| `--scopes <names>` | What a key may reach, with commas between: functions, offered flows, routes, `files`, `screens`, or `*` |
| `--roles <names>` | The roles of a key, with commas between. A key of a user takes none |
| `--user <user id>` | Makes the key that user's, with the roles the user has today |
| `--per-minute <n>` | Its count of calls in a minute, 600 when left out |
| `--for <time>` | How long it lives, as `"90 days"`. Left out, it does not end |
| `--asks none` | A key that needs no person for a function that states `danger: 'ask'` |
| `--right <rights>` | Makes a key with a right, which is a caller at the addresses of its right and nobody at every other: `read` fetches the source, every file of the project as it was saved, and so every value a builder wrote into a file; `push` sends points too, and `publish` publishes too, each holding the ones before it where it is given alone; `bundle` fetches what is live and nothing else. `copy` makes the key of a reader of an app on many machines, and `far` that of a far reader, which is never waited for and never taken as a new writer: each is handed the whole data and the files of every loadable version, and fetches what `read` fetches. `work` makes the key of a worker (`topic.workers`). A list with commas between is held exactly as listed, so `publish,bundle` publishes and reads no source. Any other word is a right of addresses that a program of its own serves |
| `--kinds <names>` | Of a key of the right `work`: the kinds that its workers may state, with commas between. Left out, each kind |
| `--at-once <n>` | Of a key of the right `work`: the most tasks one of its workers may take at once. Left out, as many as it states |
| `--workers <n>` | Of a key of the right `work`: how many workers may be joined under it at one time, 1 when left out. One more is answered T5109 |

`tent access role` writes the `roles` of that row of `users`, as the handle `roles` does: the next request of the user has the role, or lacks it. With no engine running it starts one for the length of the command, on the development data.

## Example

```
tent access --json
tent access role add 01m4vne21rehxa0vhe4ztfk1qx staff
```

## Output

With `--json`, `tent access` prints:

```json
{ "ok": true, "value": { "tables": [{ "table": "orders", "read": "owner", "add": "signedIn", "change": "role staff", "remove": "nobody" }], "functions": [{ "name": "markPaid", "kind": "change", "access": "role staff" }], "models": [{ "name": "decider", "provider": "service", "call": "decisions.decide" }], "unlock": { "scripts": ["https://js.stripe.com"] } }, "findings": [] }
```

A rule is written as its kind: `anyone`, `signedIn`, `owner`, `where`, `allow`, `role <name>`, and `nobody` for what a table or a function does not state. A `signedIn` rule is worth what the app's own sign-up lets in: where anyone may sign up, it lets in anyone who cares to. A function that has full access holds `system`, with its reason, and one that uses raw SQL holds `sql`. A model over a service call holds `call`, the call it is. Each agent that states `policy` stands in `policies` with it. `models`, `policies` and `unlock` stand where the project has them.

`tent access key add` prints the key once, with what it carries; `list` prints every key without it, as `handle.keys` lists them:

```json
{ "ok": true, "value": { "id": "01m4vne21rehxa0vhe4ztfk1qx", "name": "reports", "scopes": ["monthlyTotals"], "roles": ["staff"], "perMinute": 120, "createdAt": "2026-10-15T08:00:00.000Z", "expiresAt": "2027-01-13T08:00:00.000Z", "key": "tent_01m4vne21rehxa0vhe4ztfk1qx_..." }, "findings": [] }
```

`tent access role add` and `tent access role remove` print the user and the roles that the user has from then on:

```json
{ "ok": true, "value": { "user": "01m4vne21rehxa0vhe4ztfk1qx", "roles": ["staff"] }, "findings": [] }
```

## Errors

`code.T2103` when `tent access role` or `--user` names a user that no row of `users` has, and `code.T0014` when the app has no `users` table. `code.T0002` for a key with `--user` and `--roles` both, and for a field that does not fit.

## See also

`topic.commands`, `handle.roles`, `handle.keys`, `option.table.access`, `option.query.access`
