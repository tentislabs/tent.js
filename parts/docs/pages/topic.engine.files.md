# What the engine tells and writes

This page says what the engine tells, what it writes into the data folder, and the adapters it takes.

## What the engine tells

```ts
engine.on('version.switched', ({ app, from, to }) => {})
engine.on('change.done', ({ app, name, caller, touched }) => {})
engine.on('row.changed', ({ app, table, id, kind }) => {})
engine.on('call.failed', ({ app, name, caller, error }) => {})
engine.on('app.asleep', ({ app, dueAt }) => {})
engine.on('app.woke', ({ app }) => {})
engine.on('run.failed', ({ app, flow, run, key, failure }) => {})
engine.on('run.stopped', ({ app, flow, run, key }) => {})
```

Each is told once the write it belongs to is committed. A change that was undone tells nothing but its failure. `run.failed` and `run.stopped` tell a run of a flow that ended so, with what a caller would see of its failure: a flow hears them as events too (`option.flow.onStop`, `topic.flows.failures`).

## What it writes into the data folder

| File | Holds |
|---|---|
| `data.db` | The tables of the app and the engine's own |
| `logs.db` | Calls, errors, slow queries and slow draws of screens, denied calls, and the lines of `handle.log` |
| `versions/` | The versions the engine runs |
| `engine.json` | The port, the admin token, the number of the program and the mode, readable only by the current user. It is taken away when the app is closed, and stands while it sleeps |
| `asleep.json` | Of an app that sleeps: its names, its running version and the moment at which something of it is due. It is taken away as the first act of a waking |

## The adapters

`createEngine({ makers })` takes a function for each part that the program puts in place of ours: `adapter.Store`, `adapter.Clock` and `adapter.Lease`. Each is called once when an app opens, and is handed where the data of that app lies. A made thing that has `close` is told when the app is closed.

`createEngine({ readBody })` takes the reader of a sequence, which the program that starts the engine hands over where the build tools are installed, as `tent start` does. An engine that was handed none offers no `sequence` to a model: its agents work by tool calls alone.
