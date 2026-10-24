# `tent publish`

Publishes the files of a point of the history to a server: the point is built for release and checked here, what the server lacks is sent, and the server adds the version beside the one that runs, asks its health query, and switches to it.

## Usage

```
tent publish --to <name or address> [--point <point>] [--yes] [--accept-impact] [--gradual] [--stop-runs] [--install] [--move] [--insecure <host>] [--data <folder>]
tent publish --to <name or address> --back [--yes] [--stop-runs]
tent publish --to <name or address> --status | --widen | --back
tent publish --to <name or address> --preview
```

## Options

| Option | Means |
|---|---|
| `--to <name or address>` | The server, by the name `tent login` kept its key under, or by its address. Its key holds the right `publish` |
| `--point <point>` | The point to publish: a name, or the first 8 or more characters of an id. Left out, the files as they stand, recorded first |
| `--yes` | Publishes. Without it the command prints what the publish would do and changes nothing: whether it is hard, whether it opens the app again, what breaks a caller, and what would refuse it |
| `--accept-impact` | Lands a publish whose impact widens rights or breaks callers outside, beside `--yes`: without it such a publish is refused, so a script cannot land either unread (`command.impact`) |
| `--gradual` | Gives the new version first to a share of the visitors, watches it against the version that runs, and widens it step by step or takes it back by itself, as `release` of `project` says (`option.project.release`) |
| `--status` | Shows the release under way: its step of how many, and the share of the callers it reaches, or that it reached every visitor, or was taken back and why |
| `--widen` | Moves the release under way on to its next step by hand. `--back` takes it back by hand |
| `--stop-runs` | A hard publish stops the runs of older versions that wait, where it would be refused for them |
| `--install` | A point whose lock file is not the project's own has the packages of its lock file installed into the folder it is built in. Without it such a point is not built |
| `--move` | The rows of a table that gains or loses `tenant` are moved from one way to the other (`option.table.tenant`) |
| `--back` | Goes back to the version that was live before: the second parent of the live point |
| `--preview` | Publishes the branch that the history follows as a preview of its own, and nothing else: the server runs it beside what is live, as an app of its own at `<branch>.<the server's name>`, as `rush.test.shop.example.com`, in the mode `test`. It needs no `--yes`, and changes nothing of what is live |
| `--insecure <host>` | Reaches that host over a plain connection, for two machines on a network of their own |
| `--data <folder>` | The folder of the history, where it is not `.tent` of the project |

## Example

```
tent build --out dist                          # the first version is brought by hand
tent start dist --data /srv/shop               # on the server
tent access key add deploy --right publish     # on the server
tent login https://shop.example.com            # here, with that key
tent publish --to live                         # prints what it would do
tent publish --to live --yes
```

The server holds every step to the version: it is refused (T9103, with its reason in `fields`) where a table change does not fit a row, where a secret that a definition names has no value there, where the health query that `publish: { health, within }` of `project` names fails or is late, where a module of the version does not load or a browser file of it holds the value of a secret of the server, and where a hard publish meets a run that waits. A publish that changes `engine.ts` opens the app again: calls that arrive meanwhile wait and are answered. Pages opened before keep their version, which stays loadable for `versionKept` (1 day), or are told to reload after a hard switch. One publish runs at a time.

**A preview** runs on a copy of the data of the server where the server runs in the mode `test`, with the secrets of its test data, and on the seed alone where it runs in the mode `live`, with no secret of the server's own. It is handed a key of its own, as `secretKey` of `engine.open`, and reads no key of the server's program: on a server of test data the key that sealed those secrets and rows, and on another a new one, kept with the preview for its next opening: it never holds live rows or the secrets of live unless the builder copies them there by hand. A preview of a branch replaces the one before. It is taken away when its branch is merged into a branch that is pushed to the server (`command.push`), and after `limits.previewKept` (7 days), and the server opens it again when it starts. The name of a branch that is previewed is small letters, digits and hyphens. The command prints the address the preview answers at.

Set the secrets and the settings of the server with `tent secrets set <NAME> --to <target>` and `tent settings set <name> <value> --to <target>`: a secret is never part of a version, a point or a blob.

## Output

With `--json`:

```json
{ "ok": true, "value": { "version": "9f3a1c0e5b7d2a4f6c8e0a2b4d6f8a1c", "point": "1e201154201875ad3b445f8082ae917a", "hard": false, "opens": false, "breaks": [], "findings": [], "published": true, "to": "live" }, "findings": [] }
```

`breaks` holds each thing that would break a caller of the API, MCP or the command line, in the form of a change of `command.history`: a function that is gone or offered to a door no more, an input that became required or changed its type, an output that lost a field, a rule that became narrower. `refused` says what would stop a publish that was not taken. `old` names each column that work fills whose work the version changes, with how many of its values become old and `perDay` of its `by`, which the pass that makes them anew holds to; it asks nothing and stops nothing.

## Errors

`code.T9101` for a point that does not pass the check, is unsettled, or holds another lock file. `code.T9103` where the server refuses the publish. `code.T9104` for a key without `publish`. `code.T9107` for what was not sent. A command that fails ends with 2.

## See also

`command.push`, `command.login`, `command.secrets`, `command.settings`, `command.start`, `option.project.publish`
