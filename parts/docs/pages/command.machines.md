# `tent machines`

Lists the writer and each reader of a running app, the writer first. It is for an engine that runs, and starts none.

## Usage

```
tent machines [--data <folder>]
```

## Options

| Option | Means |
|---|---|
| `--data <folder>` | The data folder of the engine to ask. Left out, it is `.tent/` of the project |

## Example

```
tent machines --data /srv/shop
```

## Output

With `--json`, the epoch, and each machine as `app.machines` gives it:

```json
{ "ok": true, "value": { "epoch": "1.01m4ssnmz8f11sy43ctwdn5nvd", "machines": [{ "id": "01m4ssnmz8f11sy43ctwdn5nvd", "role": "writer", "far": false, "take": true, "own": "https://shop.example.com", "n": 42, "current": true, "since": 1791878400000 }, { "id": "01m4ssp02ke8w7rr2pa9cq4d1x", "role": "reader", "far": false, "take": true, "address": "10.0.0.7", "key": "3f9a61c2b7d04e58", "n": 42, "current": true, "since": 1791878460000 }] }, "findings": [] }
```

`n` is the number of the last write a machine holds, `far` says that no ordinary write waits for it, and `take` that it may take over. On a reader the list is what its writer answers, and what the reader last held where the writer cannot be reached.

Where a writer heard of another writer, the value also holds `other`, as `{ "epoch": "2.01m4ssp02ke8w7rr2pa9cq4d1x", "own": "https://b.example.com" }`: the newest other writer that it heard of since it was started, with the address of that machine where it told one. A writer that was stopped names the machine that stopped it.

## Errors

`code.T0013` where no engine runs on the data folder.

## See also

`command.take-over`, `command.start`, `code.T0029`
