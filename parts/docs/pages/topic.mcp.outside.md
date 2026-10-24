# An outside MCP server

The engine is a client of the standard too: a service that states `mcp: true` is an outside server whose approved tools an agent may be given, and `mcp: { command }` one that is a program the engine starts. `tent mcp approve <service>` writes its tools into `mcp.lock.json`, and a tool that changed since is held back (`code.T7112`). See `option.service.mcp`.

## In a test

`app.mcp({ as, form })` of `tentjs/test` is a client joined to the test app with no network, as a caller, or with `{ token }`, in the newest form of the standard or in the older one that `form` names.

```ts
const client = app.mcp({ as: await app.user({ email: 'ada@example.com' }) })
const tools = await client.tools()
const answer = await client.call('openOrders', {})
```

## See also

`option.project.mcp`, `code.T7004`, `code.T7009`, `code.T7021`, `code.T7120`, `handle.keys`, `handle.grants`, `command.cli`, `topic.tests`
