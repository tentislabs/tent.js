# `secrets`

The secrets of an app: a key of a service, a password of a mail server. A definition names one with `secret('NAME')`, and the framework puts its value on the outgoing call. Code that needs the value itself opens it here.

## Example

```ts
import { action, anyone, secrets, text } from 'tentjs'

export const sign = action('sign', {
  access: anyone('every visitor may ask for a signed link'),
  input: { path: text() },
  output: text(),
  run: async ({ input }) => {
    const key = secrets.LINK_KEY.reveal()
    return `${input.path}?sig=${await signature(input.path, key)}`
  },
})
```

## Members

| Member | Is |
|---|---|
| `secrets.NAME` | The secret of that name, wrapped: written out as text, in a log or in JSON, it reads `[secret]`. Any name may be written |
| `secrets.NAME.reveal()` | Its value, as text |
| `secrets.set(name, value)` | Sets a secret of the app's own mode, as `tent secrets set` does, and answers a promise. It is how a screen of the builder's own asks a person for the key of a service |
| `secrets.remove(name)` | Takes one away, and answers a promise |

**Where a value comes from.** `tent secrets set NAME` sets a value, on test data, and with `--live` on live data: see `command.secrets`. The values are kept encrypted in the data folder, in `secrets.test` and `secrets.live`, under a key that is given as `TENT_SECRET_KEY` on a server and lies in `secret.key` of the data folder on a computer of your own. The modes `development` and `test` read the test file, and `live` the live one. In a test app every secret that a definition names has the value `test-<NAME>`.

**Where `reveal()` works.** In an action, a route, a step of a flow, `onRequest`, `identify` and a maker of `engine.ts`. A query and a change open no secret. The check lists every use of it, as a note: `code.T7015`.

**No secret is written into a log.** Every value of 8 characters or more that the engine holds is replaced by `[secret]` in each log line, error message and trace before it is kept, also where it is written with percent signs or in base64, and for a value that is an address its user name and its password by themselves. An answer is not searched: what code reveals and then answers is the builder's own word.

**`set` and `remove` are full access**: a function that uses them states `system: 'why'` and carries the rule of who may set a secret itself. They work in an action and a route.

## Errors

`code.T0019` when `reveal()` is asked of a secret that has no value, when no key is at hand, and when a value does not open under this key, this mode and this name.

`code.T0013` when `reveal()`, `set` or `remove` is used in a query or a change, and when `set` or `remove` is used in a function that states no `system`.

## See also

`command.secrets`, `handle.settings`, `code.T7015`, `code.T3007`
