# The table `users`

The people who sign in to an app are the rows of a table named `users`. A project that has callers who are users writes that table itself.

```ts
import { list, table, text } from 'tentjs'

export const users = table('users', {
  columns: {
    email: text({ unique: true }),
    roles: list(text(), { default: [] }),
  },
  access: { read: 'owner' },
})
```

On `users` the rule `'owner'` means the caller's own row: a user reads what the app keeps of them, and of nobody else. A table that holds the address of a person is not opened to every signed-in caller. Where the staff must see every user, the rule is `role('staff')`, or a query that states `system` and answers the columns that they need.

## What the table must have

| Column | Type | For |
|---|---|---|
| `roles` | `list(text())` | The roles of the user. The rule `role('staff')` lets a caller in whose row holds `'staff'` in this list. A default of `[]` makes a new user one with no role |

Every other column is the project's own: a name, an address, whatever the app keeps of a person. The `id` of the row is the id of the user: `user.id` in a rule and in a `run`, and what a link to `users` holds.

A project that needs a user and has no table of that name fails with `code.T0014`: `app.user` and `app.session` of a test, and a rule that asks for a role.

## Who may read and write it

The rules of the table are the project's to state, as for any table. A rule that is left out means nobody: a table with no `add` and no `change` rule is written by code with full access alone, as a seed and a function with `db.system` (`topic.db`). Since a role says what a caller may do, no rule of `users` should let a caller write `roles`.

## In a seed and in a test

```ts
export default seed(({ db }) => {
  const sam = db.users.add({ email: 'sam@shop.example', roles: ['staff'] })
  db.orders.add({ placedBy: sam.id, total: 1999 })
})
```

In a test, `app.user({ email: 'maya@example.com', roles: [] })` adds a row and answers a caller (`topic.tests`), and `app.browser({ as })` is a browser of that user, by a session that `app.session` made. A person signs in through the app's own sign-in screen (`topic.signIn`).

**The id of a user.** What takes a user - `app.session`, `app.as`, `--as` of `tent cli` and of `tent run` - takes the `id` of a row of `users`. A test has it from what made the row, `(await app.user({ ... })).user?.id`, or finds a user of the seed among the rows: `(await app.rows('users')).find((one) => one.email === 'sam@shop.example')?.id`. On this computer `tent data rows users` prints every row of the table with its `id`, and then `tent cli . --as <that id> open-orders` acts as that user (`command.data`, `command.cli`).

## See also

`word.table`, `word.role`, `word.seed`, `topic.tests`, `topic.signIn`, `code.T0014`
