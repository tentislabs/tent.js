# `hold` of `project`

Runs the app's actions, and every package they import, in a room of their own: a process under the runtime's permission model that reaches data, files, the outside and programs only through the engine. Off unless it is stated.

The hold is the held room (`adapter.Room`): every other kind of the app's code runs in the engine's program, and an action, with its packages, in the held program of its version, started with its first action, which reaches the engine by the same crossing as any room. What the hold names is checked by the engine itself at the ways out, in every room: `fetch` against `net`, the program of an outside MCP server against `programs`, and a package that loads a native module, by the map, against `native` when the version is loaded. Where the program that holds the engine gives a room of its own, the held program is not used: that room is the wall, and the names still hold.

## Value

`true` holds the app and names no way out. A record names the ways out the app may reach:

| Field | Lists |
|---|---|
| `net` | The hosts that `fetch` may reach, each as `privateHosts` writes one |
| `programs` | The programs the engine may start for the app, each by its name |
| `native` | The native modules the room may load, each a package name |

Left out, the app runs as it is installed, with the rights of the app: nothing is held. In the room a query and a change answer at once as before, and a member of a handle that answers at once in the engine answers a promise, as an action's `db` already does. A package that takes a way out the hold does not name is refused with `code.T0035`, and the engine runs on.

The hold refuses a package that takes the ordinary way out. It is no wall against code written to break out of it, as the runtime says of its permission model. A `native` entry runs outside the model and so lifts the hold for the whole room. Within the room the actions of the app share one process, so a package that replaces `globalThis.fetch`, or any other thing of the runtime that the room shares, changes it for the other actions of the app, though for nothing of the engine. Without the hold, a package that sends data out by its own means is not seen by the engine, so a tool's line does not know of it; a package that a query or a change imports runs in the engine, unheld, whether or not the hold is on. With the hold on, a tool whose action reaches a way out the hold names is told `Sends data out.`, over `sends: false`. The map lists every package with its ways out and the ways the hold names, and the check notes each entry of the hold (`code.T7016`).

The engine shuts in the room what the permission model leaves open: the runtime's own SQLite module, `process.kill`, `process._debugProcess` and the setting of a V8 flag, and it refuses to start the room where a link inside the built code leads outside it. What the model itself does not hold and the engine does not close is named here: a request for an OpenSSL engine at run time fails, and nothing of the runtime that was opened before the room started is handed to it, since the room is started with no file open, an empty environment and its standard streams alone.

## Example

```ts
export const shop = project('shop', {
  hold: { net: ['api.example.com'], programs: ['ffmpeg'], native: ['sharp'] },
})
```

## Errors

`code.T0035`, where an action or a package it imports reaches what `hold` does not name.

## See also

`word.project`, `option.project.privateHosts`, `command.map`, `topic.fetch`
