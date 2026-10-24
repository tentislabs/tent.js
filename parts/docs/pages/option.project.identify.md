# `identify` of `project`

The builder's own way of telling who is calling: a company's own login, or a token of the builder's own. It is asked where nothing of the engine named a caller.

## Value

A function that is handed `{ request, about, db, call }` and answers the id of a row of `users`, or nothing. It may be `async`. It is code, and is stored as a module. Left out, the engine's own ways hold alone.

| Handed | Is |
|---|---|
| `request` | The standard request, without its body |
| `about` | `{ from, origin }`: the address the request came from, and the scheme and the name the app was reached by |
| `db` | Reads with full access, and answers promises: `await db.users.where({ email }).first()` |
| `call(fn, input)` | Calls a function as the system, so that a person who is seen for the first time can be given their row. `fn` is the function as the project imports it, or its record by name, `{ kind: 'change', definition: 'addUser' }`, from a program that names no definition of the app |

It is asked on every request that passes step 3 of the door, after a session: a request that carries a session is that user, and `identify` is not called for it. The caller is the user of the row it names, with the roles of that row. An id that no row of `users` has is nobody. It may use `fetch`, `log`, `settings` and `secrets`, and open a secret with `reveal()`.

It is held to `limits.actionTime`. The requests of one address that reach it are held to `limits.identifyPerMinute`, 600 where none is stated, before it is called: an app whose every user comes through it behind one address raises that. A live connection of a caller it named is closed after `limits.identifyKept`, 15 minutes where none is stated, and the page opens it again: so a login that ended elsewhere ends here too.

## Example

```ts
import { project } from 'tentjs'

export const shop = project('shop', {
  identify: async ({ request, db }) => {
    const email = request.headers.get('x-company-user')
    if (email === null) return undefined
    const user = await db.users.where({ email }).first()
    return user?.id
  },
})
```

## Errors

`code.T0009` for that request when the function throws.

`code.T0008` when it works past `limits.actionTime`.

`code.T0005` for one request more than `limits.identifyPerMinute` in a minute from one address, before the function is called.

## See also

`word.project`, `handle.sessions`, `topic.users`, `option.project.limits`
