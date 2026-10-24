# `tent workers`

Lists the workers that are joined to a running writer, and for each kind of worker what waits and what is out. It is for an engine that runs, and starts none.

## Usage

```
tent workers [--release <id>] [--data <folder>]
```

## Options

| Option | Means |
|---|---|
| `--release <id>` | Hands that worker nothing more, as `app.release` does. The first 8 characters of its id name it |
| `--data <folder>` | The data folder of the engine to ask. Left out, it is `.tent/` of the project |

## Example

```
tent workers --data /srv/shop
tent workers --release 01m4x5y7
```

## Output

With `--json`, `{ workers, work }`, as `app.workers()` and `app.work()` answer them. `ready` names the versions a worker is ready for, `inARow` how many tasks in a row ended failed or lost on it, and `oldest` of a kind, where one waits, the age of the oldest in milliseconds:

```json
{ "ok": true, "value": { "workers": [{ "id": "01m4x5y72ke6aay7szexb9d1dz", "kinds": ["gpu"], "atOnce": 1, "working": [], "ready": ["c362e0acd43fbe1469bbfa798b16f20e"], "loaded": [], "inARow": 0, "key": "94df6c2823068df5", "since": 1791878400000 }], "work": [{ "kind": "gpu", "waiting": 0, "heldBack": 0, "out": 0, "limits": [], "workers": ["01m4x5y72ke6aay7szexb9d1dz"] }] }, "findings": [] }
```

With `--release`, `{ "released": "<id>", "empty": true }`: `empty` says that the worker holds no task, so that its machine may be stopped.

## Errors

`code.T0013` where no engine runs on the data folder.

## See also

`topic.workers`, `command.start`
