# `tent pull`

Fetches the points of a server's branch of the name that `now` follows and merges them into the files of the project: a pull is always a merge, and never an overwrite (`topic.history.engine`).

## Usage

```
tent pull [--to <name or address>] [--unchecked] [--insecure <host>] [--data <folder>]
```

## Options

| Option | Means |
|---|---|
| `--to <name or address>` | The server, by the name `tent login` kept its key under, or by its address |
| `--unchecked` | Pulls into a head that did not pass the check on this computer |
| `--insecure <host>` | Reaches that host over a plain connection, for two machines on a network of their own |
| `--data <folder>` | The data folder that holds `history.db`. Left out, it is `.tent/` of the project |

## Example

```
tent pull --to live
```

A plain definition that only the server's side changed is written in its place, with no other character of its file changed. What clashes arrives in `tent.clash.ts`, as a merge writes it (`command.history`). Where this computer has nothing of its own since the last pull, the merge is the server's point itself. The pulled point is not checked until this computer has checked it: the files are built and checked after the pull, as a save is, and the point marked with what was found. With no `tent dev` running, the command runs the project in development for its length, so that the data follows the files. To take the server's side whole, pull and then go back to the server's point with `tent history back`.

## Output

With `--json`:

```json
{ "ok": true, "value": { "point": { "id": "1e201154201875ad3b445f8082ae917a", "kind": "merge" }, "changes": [], "lines": [], "clashes": [], "from": "live", "checked": true, "version": "9f3a1c", "findings": [] }, "findings": [] }
```

## Errors

`code.T9101` for a head that did not pass the check here. `code.T9104` for a key without the right `read`. `code.T9107` for a point or bytes that do not fit. `code.T0001` where no key is kept for the target. A command that fails ends with 2.

## See also

`command.push`, `command.login`, `command.history`, `topic.history`
