# `tent login`

Keeps the key of a server for publishing, pushing and pulling, in `keys.json` of the runner's folder, under a name: the mode of the server, unless `--name` gives another.

## Usage

```
tent login <address> [--name <name>] [--insecure <host>]
```

## Options

| Option | Means |
|---|---|
| `--name <name>` | The name the key is kept under, which `--to` of `tent publish`, `tent push` and `tent pull` takes. Left out, it is the mode of the server: `live` or `test` |
| `--insecure <host>` | Reaches that host over a plain connection, for two machines on a network of their own |

## Example

```
tent access key add laptop --right push        # on the server, which prints the key once
tent login https://shop.example.com            # asks for that key
tent login https://test.shop.example.com       # kept as test
tent push --to test
```

It asks for the key without showing it, or takes it from `TENT_KEY` where `TENT_AT` names this server beside it: a key of another server is never sent. With no person at the keys, the key may also be handed in on the input. The key is tried on the server first: a key it does not take is not kept. A key of the right `operate` is tried on the run commands of the server, which alone it reaches, and is kept for `tent runs --at` and `tent logs --at`. `keys.json` is readable only by the current user, and is read only when it is an ordinary file that the current user owns. A project that has a test server and a live one keeps a key of each, each under its mode.

## Output

With `--json`:

```json
{ "ok": true, "value": { "server": "https://shop.example.com", "name": "live", "mode": "live" }, "findings": [] }
```

## Errors

`code.T9104` for a key that the server does not take. A command that fails ends with 2.

## See also

`command.push`, `command.pull`, `command.access`
