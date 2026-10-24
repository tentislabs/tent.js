# `tent filled`

Lists every column that work fills, with how many of its values are missing, old and failed. With no engine running on the data folder it builds the project and starts one for the length of the command.

## Usage

```
tent filled [--look] [--failed <table>.<column>] [--of <tenant id> | --all] [--data <folder>]
```

## Options

| Option | Means |
|---|---|
| `--look` | Works out, for every row of each filled column, what its work would be handed, and marks each row whose work was handed other values, a row written in raw SQL among them |
| `--failed <table>.<column>` | Lists the values of that column that failed for good, with what a caller would see of their errors |
| `--of <tenant id>` | For a tenant table: `--look` and `--failed` work in the file of that tenant, opened where it is closed. Left out, in the files that stand open |
| `--all` | For a tenant table: `--look` and `--failed` work in every file of a tenant |
| `--data <folder>` | The data folder of the engine to ask. Left out, it is `.tent/` of the project |

## Example

```
tent filled --data /srv/shop
tent filled --look
tent filled --failed orders.summary
```

## Output

With `--json`, `{ columns }`, as `app.filled()` answers them: for each column how many values are `missing`, `old` and `failed`, the age of the oldest one that is missing or old in milliseconds, how many were made in the last hour, and the limits of its `by`, or `none` where it states none:

```json
{ "ok": true, "value": { "columns": [{ "table": "orders", "column": "summary", "missing": 2, "old": 0, "failed": 0, "oldest": 5000, "lastHour": 40, "limits": "none" }] }, "findings": [] }
```

What the filling of a column uses is counted under its starter, `fill:<table>.<column>`, and `perDay` of its `by` holds that column alone. A value that a limit of use refused stays due, counts no try, and is made when the limit lets it: at the turn of the day, or when a reserve is let go. A vector column that states its model and `by: 'body'` hands `batch` rows, 32 where it states none, to one `embed`.
Of a tenant table (`option.table.tenant`), the files of tenants that stand open are counted themselves, and each closed one by what the directory kept of it when it closed. A closed file whose values rest on a work that changed since is opened by the pass, `limits.filesAtOnce` at a time, and its values are made anew there.

With `--look`, `marked` beside them is how many values were marked. With `--failed`, `{ "failed": [{ "id": "<row>", "error": { "code": "T0009" } }] }`.

## Errors

`code.T0002` for `--of` beside `--all`, and for `--failed` that names no `<table>.<column>`.

## See also

`topic.workers`, `code.T2015`
