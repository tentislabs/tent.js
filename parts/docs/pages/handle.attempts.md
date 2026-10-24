# `attempts`

Bounds what can be guessed: it counts the tries of a key, and fails once more were counted than the bound within a length of time.

## Example

```ts
import { action, anyone, attempts, fail, passwords, sessions, text } from 'tentjs'

export const signIn = action('signIn', {
  access: anyone('a sign-in is open to every visitor'),
  system: 'reads the user that signs in, whom nobody may read yet',
  input: { email: text(), password: text({ secret: true }) },
  run: async ({ input, db }) => {
    // By the account and the address, and by the account alone with a higher bound.
    attempts.limit(`signIn:${input.email}`, { tries: 5, per: '10 minutes', address: true })
    attempts.limit(`signIn:${input.email}`, { tries: 50, per: '1 hour' })
    const user = await db.system.users.where({ email: input.email }).first()
    if (!user?.password || !(await passwords.check(input.password, user.password))) return fail('wrong', 'Wrong email or password.')
    attempts.clear(`signIn:${input.email}`, { address: true })
    sessions.start(user.id)
  },
})
```

## Members

| Member | Does |
|---|---|
| `attempts.limit(key, { tries, per, address })` | Counts one try for `key`, and fails with `code.T0005` when more than `tries` were counted within `per`. `tries` is a whole number of 1 or more, and `per` a length of time, as `'10 minutes'`. The window starts at the first try, and a count is removed when its window has ended |
| `attempts.clear(key, { address })` | Empties the count of `key`, as after a sign-in that worked |

**The key** is a text of the project's own choosing, which names what is tried: an account, a code, a coupon.

**`address: true`** keeps the count for the key and the address of the request together, so that one address cannot use up the tries of another. An address of the newer kind is counted by its first 64 bits, since one line at home holds a whole range of them. Where no request is being answered, as under `app.call` and in a step of a flow, the count is kept for the key alone. A count with `address: true` and one without are two counts.

**A count is a write of its own**, made at once: a try whose call fails afterwards still counts. So `attempts` works in an action and in a route, and not in a change, where it would be undone with the write.

## Errors

`code.T0005` for one try more than `tries` within `per`.

`code.T0013` when it is used in a query or a change.

`code.T0002` when the key is no text, `tries` is no whole number of 1 or more, or `per` is no length of time.

## See also

`handle.passwords`, `handle.sessions`
