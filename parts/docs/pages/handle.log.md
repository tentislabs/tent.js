# `log`

Writes a line of the log of the app, with the definition whose code wrote it. It writes nothing of the app itself, so it may be used in a query, a change and an action alike.

## Example

```ts
import { action, log, text } from 'tentjs'

export const importOrders = action('importOrders', {
  access: 'signedIn',
  input: { source: text() },
  run: async ({ input }) => {
    log.info('the import began', { source: input.source })
  },
})
```

## Members

| Member | Does |
|---|---|
| `info(message, data?)` | Writes a line of the level `info` |
| `warn(message, data?)` | Writes a line of the level `warn` |
| `error(message, data?)` | Writes a line of the level `error` |

Each answers at once. `data` is kept as JSON text beside the message. `tent logs` reads the lines.

## Errors

`code.T0010` when it is used with no engine, and `code.T0013` when no call is under way.

## See also

`handle.settings`, `topic.errors`
