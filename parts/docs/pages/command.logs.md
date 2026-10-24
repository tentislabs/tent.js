# `tent logs`

Prints the newest calls, errors and slow queries of the log of the app, each in the order they were written, or one trace as its tree, or the slowest traces beside the slow queries, or the speed visitors saw of each screen. A screen whose drawing took long stands among the slow ones, under its name. It reads the log through the engine, and never opens the file itself. With `--mail` it prints the mail the app sent in development.

## Usage

```
tent logs [--errors] [--mail] [--trace <id>] [--slow] [--vitals] [--since <time>] [--data <folder>] [--at <server>] [--insecure <host>]
```

## Options

| Option | Means |
|---|---|
| `--errors` | The errors alone, each with its message, the calls that led to it as `stack`, and its trace |
| `--mail` | The mailbox of the app in the mode `development`, the newest first: each message it sent, who it is from and to, its subject, its text and its HTML, and the names of its files. The mailbox is the one place every reader of unsent mail reads (`handle.mail`); in development it keeps the last 100 in memory while the program runs, and nothing of them is sent. `/_t/mail` shows the same, each drawn as its receiver would see it, with its links working, to this computer alone, as a pass is, answered as `{ "mails": [{ "at", "from", "to", "subject", "text", "html", "files" }] }` |
| `--trace <id>` | One trace as a tree: each span on a line under its parent, with its length and its outcome, the lines and errors of the log under the span they were written in - a call, a call out, a model call and a slow query are spans themselves, their own rows of the log - and the slowest path marked with `*`. The id is the `trace` of an error answer, of `tent runs show`, or of `--slow` |
| `--slow` | The slowest traces, the slowest first, each by its first span, beside the slow queries: with `--since`, of that time |
| `--vitals` | For each screen and version, the 75th share over a day of each measure of the speed its visitors saw, against the line of good for it, the screens furthest past their line first, and each version beside the one before (`option.project.vitals`) |
| `--since <time>` | Only what was written within that length of time, as `'1 hour'` |
| `--data <folder>` | The data folder of the engine to ask. Left out, it is `.tent/` of the project |
| `--at <server>` | The app on a server, by the name or the address that `tent login` kept its key under, a key of the right `operate`. The log of a server answers no mail, and leaves out the words and calls of each error and the data of each line, in a trace's tree too, which a value could stand in: names, codes, counts, times and traces stay |
| `--insecure <host>` | With `--at`: reaches that host over a plain connection |

## Example

```
tent logs --trace 4bf92f3577b34da6a3ce929d0e0e4736
```

## Output

With `--json`, the 200 newest rows of each table:

```json
{ "ok": true, "value": { "calls": [{ "n": 1, "at": 1791878400000, "app": "shop", "name": "openOrders", "kind": "query", "callerKind": "user", "callerId": "01m4ssnmz8f11sy43ctwdn5nvd", "ms": 2, "ok": 1, "code": null, "ref": null, "trace": "4bf92f3577b34da6a3ce929d0e0e4736", "span": "00f067aa0ba902b7" }], "errors": [], "slow": [] }, "findings": [] }
```

A query that passes 50 ms is written among the slow ones. Where SQLite's own plan of a read of it reads a whole table that it filters or orders, a line of the log says so once a version for that query, with the entry to add to the table, as `indexes: [['status', 'placedAt']]`: the columns it holds to one value, then to a range, then its order. It names the file the table is written in. The engine adds no index by itself: an index costs every write.

With `--trace`, `{ "trace", "spans" }`, each span `{ "span", "parent", "name", "kind", "at", "ms", "ok", "code", "facts", "machine", "slowest", "under", "rows" }`, `under` holding the spans below it. With `--slow`, `{ "slow": [{ "trace", "name", "kind", "at", "ms", "ok" }] }`.

A call that failed with an error which is not the caller's to see holds a `ref`, and the row of `errors` with that `ref` holds the error. Every row names the trace and the span it was written in. The log has a cap, `logSize` in `limits` of the project, 200 MB where none is stated: a log that reaches it drops its oldest rows. A trace is read on this computer alone, by this command: no address of the engine answers it.

## Errors

`code.T0002` for words after `--since` that are no length of time, and for a `--trace` that is no id of a trace.

`code.T0001` for a trace that was not kept: `option.project.trace` says which are.

## See also

`topic.commands`, `handle.log`, `command.run`, `option.project.trace`
