# MCP

MCP is the standard by which a chat app, or a program of another kind, reaches the functions of an app as tools. A function, a flow or an agent that states `offer: ['mcp']` is a tool at the address `/mcp`, and every call of it passes the door as its caller, as a call from a page does.

## Offering a function

```ts
import { query, list, object, text } from 'tentjs'

export const openOrders = query('openOrders', {
  about: 'The orders of the person asking',
  access: 'signedIn',
  offer: ['mcp'],
  input: {},
  output: list(object({ title: text() })),
  run: ({ db }) => db.orders.all().map((one) => ({ title: one.title })),
})
```

A function offered to MCP states `about`, which is the description of its tool (`code.T7009`), and has a name of 64 characters at most (`code.T1014`). `mcp: { names: { openOrders: 'orders' } }` of `project` gives its tool another name. `findFunction` and `callFunction` are names that a tool cannot have (`code.T1009`).

## What a chat app is told

| Of a tool | Is |
|---|---|
| Its name | The name of the function, or what `mcp.names` gives it |
| Its title | The name in words: `markPaid` is "Mark paid" |
| Its description | The function's `about` |
| Its input | The input of the function, as JSON Schema |
| Its answer | The value as the standard's typed answer, and the same as JSON text. A value that is no record is `{ "value": ... }`, and nothing is `{}`: the part of the answer that is kept from the model then holds `tent.wrapped` |
| Its marks | A query only reads. A change does not; it is marked destructive when it states `danger: 'ask'`, and not destructive when every write of it adds a row. An action and a flow are marked as a change that is not plain, and one that states `changes: false` only reads. A tool that sends data out is marked open to the world |

The marks are hints to a chat app and no guard: the guard is the rule of each function, which holds for every caller.

A failure of a tool is an answer marked as an error: `Error <code>: <message>`, with a line `Fix:` and a line for each field that failed, and the wire error under `tent.error` in the part that is kept from the model. So a model can mend its input and try again.

A chat app gives its model the text of an answer alone, never its typed part or the part kept from the model: Claude does so. So the text of every answer holds all that the model is to have, the value as JSON text or the words of a failure, and the typed part beside it is for a screen.

Both forms of the standard are answered: the newest, in which each request names its version and what the client can do, and whose first request is `server/discover`; and the older, which opens with `initialize`. Claude speaks the newest and falls back to the older. A request may say its method in the line `Mcp-Method`, and what a call or a reading names in `Mcp-Name`: a line that says another than the body is `code.T0002`.

## Who calls

A request at `/mcp` that names no caller is answered 401, with the line that tells a client where the sign-in is described. A caller is a key (`handle.keys`), sent as `Authorization: Bearer <key>`, held by its scopes; the user that `identify` names; a session, for a page of the app; and the caller of the admin token on this computer. A request with a caller counts on that caller's own number of requests, and one with none is counted like a request for a screen, for its address.

A chat app calls for all its users from a few addresses of its own. Behind one, raise the two counts that are held by address: `limits.screensPerMinute`, which counts the requests with no caller, and `web: { openPerAddress }` of `createEngine`, the connections one address may hold open.

`mcp: { anyone: true }` offers the functions whose rule is `anyone` to every client: a request with no caller is listed those and may call them, and is answered 401 when it calls anything else.

`mcp: { only: 'queries' }` narrows every caller to what only reads, and a list of names narrows it to those functions: it is how a builder makes the app's MCP door read-only. A function that is not offered, or that `only` leaves out, is not found (`code.T0001`).
