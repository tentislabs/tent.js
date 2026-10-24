# `roles`

Gives a user a role and takes one away. The roles of a user are the list in the `roles` column of their row of `users`, and this handle is the way that column is written.

## Example

```ts
import { change, role, roles, text } from 'tentjs'

export const makeStaff = change('makeStaff', {
  access: role('admin'),
  system: 'an admin gives the roles of every user',
  input: { user: text() },
  run: ({ input }) => roles.add(input.user, 'staff'),
})
```

The next request of that user has the role: the engine reads the row of the caller at every request, so the roles are those of today.

## Members

| Member | Does |
|---|---|
| `roles.add(user, role)` | Gives the user that role. A role that the user has is not given twice |
| `roles.remove(user, role)` | Takes that role away. One that the user lacks changes nothing |
| `roles.set(user, list)` | Writes the whole list, each role once |

`user` is the id of a row of `users`. Each member answers at once, and its write is a write of `users` like any other: a trigger fires, and a live query that reads the row follows.

**Full access.** The handle works in a function that states `system: 'why'`, which then carries its own rule in `access`, and in code that the system called, as a seed.

**Why a handle.** A role says what a caller may do, so no caller may write their own. A write of `roles` through a `db` that is limited to its caller is refused with `code.T3101`, whatever the rule of the table says: a `change` that names `roles`, also with the value the row has, and an `add` that gives a role. An `add` that gives none passes, and the row starts with no role, so a sign-up needs no `system`. `db.system` writes the column freely, as the handle does.

From the command line, `tent access role add <user id> <role>` and `tent access role remove <user id> <role>` do the same: see `command.access`.

## Errors

`code.T0013` when it is used in a function that states no `system`, and in a query.

`code.T2103` when `user` names no row of `users`, and `code.T0014` when the app has no `users` table.

## See also

`topic.users`, `word.role`, `command.access`, `handle.sessions`
