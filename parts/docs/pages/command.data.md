# `tent data`

Reads and keeps the data of an app through its running engine: the rows of a table, backups, a restore of a backup or to a moment, an import of a file of records, a cleaning of what was retired, the data files of tenants, and the data of one person. It never opens the data file itself.

## Usage

```
tent data rows <table> [--of <tenant id>]
tent data backup [--whole]
tent data restore <file> [--of <tenant id>]
tent data restore --at <moment> [--dry]
tent data import <file> --with <change> [--map 'Full name=name'] [--language <code>] [--as <user id>] [--dry]
tent data clean
tent data files [--behind] [--unswept] [--due] [--stray] [--sweep] [--retry <tenant id>]
tent data user export <id> [--out <file>]
tent data user remove <id> [--yes]
```

## Options

| Option | Means |
|---|---|
| `--out <file>` | Of `user export`: also writes the answer into that file, as JSON |
| `--yes` | Of `user remove`: removes. Without it the command shows the count, and removes nothing |
| `--of <tenant id>` | Of `rows` and `restore`, for a table that keeps a data file for each tenant: the tenant whose rows are read, or whose file is put back alone |
| `--at <moment>` | Of `restore`: brings every data file to that moment, as `2026-10-16T09:30:00Z` writes one, from the newest backup before it and the archive of the changes after it |
| `--dry` | Of `restore --at`: says which backup, how many changes and what moment, and changes nothing. Of `import`: checks every record and writes nothing |
| `--with <change>` | Of `import`: the change that each record is handed to, as its input |
| `--map '<field of the file>=<field of the input>'` | Of `import`: a field of the input for a field of the file, once for each. Left out, a field is matched by its name, in any case |
| `--language <code>` | Of `import`: the language the values of the file are written in, as `de`: its numbers, its dates, and the words of a choice. Left out, the first language of the project |
| `--as <user id>` | Of `import`: the caller that the change is called as. Left out, the system |
| `--whole` | Of `backup`: copies every file of a tenant, also one that was not written since the backup before |
| `--behind`, `--unswept`, `--due` | Of `files`: only the files that are not at the running shape of the tables or failed, that were not swept since a row they link to was removed, or in which a run must wake |
| `--stray` | Of `files`: holds the disk against the directory at once, and says what it found and did |
| `--sweep` | Of `files`: opens and sweeps every file that is unswept |
| `--retry <tenant id>` | Of `files`: tries a file again that could not be brought up |
| `--data <folder>` | The data folder of the engine to ask. Left out, it is `.tent/` of the project |

## Example

```
tent data user remove 01m4ssnmz8f11sy43ctwdn5nvd --yes
```

## Output

With `--json`, for `backup`:

```json
{ "ok": true, "value": { "file": "/apps/shop/.tent/backups/data-2026-10-13T05-10-42-345Z.db", "writes": 41, "rows": 18 }, "findings": [] }
```

`rows` answers every row of the table, with full access. `backup` makes a snapshot in `backups/` of the data folder, safe while the app runs, restores it to a temporary file as a test, and answers the rows it counted there: a backup that cannot be restored is removed and not kept as one. The engine takes a backup by itself every day, and before every table change, and keeps the last seven: `backups` of the project changes each of these. `restore` puts the file of a backup back under the running app and applies the table changes to it: `{ "restored": "<file>" }`. `restore --at <moment>` takes the newest backup taken before the moment and applies the archived changes up to it, one by one; the file of a tenant is brought to the same moment by its own backup and its own changes. It is a restore as the one of a file is: under the running app, made as one switch. The data that stood is kept as a backup of its own first, and what was put back is a backup too, so a moment after the restore is reached as well. It answers `{ "restored": "<moment>", "backup": "<the name of the backup>", "changes": 140, "reaches": "<the moment of the last change it applied>" }`, and with `--dry` the same with `"dry": true` in place of `restored`. With the archive in a store (`option.project.backups`) a data folder that was lost is restored from the store alone: start the engine on an empty folder, and restore to a moment. `clean` drops each table and each column that was retired, and nothing else: `{ "dropped": [ ... ] }`, the steps of the shared file. On an app that keeps a data file for each tenant the clean reaches each file too: every file is behind until it was cleaned, as `tent data files --behind` shows, and is brought up by the pass or when it is next asked for.

`user export` answers every row whose owner is that person, and their row of `users`: `{ "id", "user", "rows" }`. `user remove` answers `{ "removed", "rows", "refused", "backups", "archive" }`: how many rows of each table are theirs, the rows that a link which refuses kept, how many backups made before still hold the person, until they age out, and whether the archive of the changes still holds them, as it does until what it kept of them is past, with the backups it reaches back to. It removes in one write, and writes `removed` in place of the person wherever the log names them.

For an app that keeps a data file for each tenant, a backup is a folder: the shared file, every tenant's file that was written since the backup before, and `files.json`, which names for every file the backup that holds it. A backup that ages out hands the files that a kept one points at to the oldest kept backup first, so every kept backup puts back every file. `restore` takes such a folder, puts back every file and removes the files that it does not name; with `--of` it puts one tenant back alone, the row of the tenant too where it is gone: `{ "restored": "<folder>", "of": "<tenant id>" }`. `files` prints the directory: `{ "files": [{ "table", "id", "layout", "tables", "writes", "size", "open", "behind", "unswept", "failed", "due" }] }`, with `stray`, `swept` and `retried` where a flag asked for them.

## Errors

`import` reads CSV and TSV with the header line naming the fields, a CSV whose header holds `;` and no `,` separated by `;`; JSON, a list of records; JSON lines; and spreadsheets (`.xlsx`), every sheet by its name with its first row as its header, by a reader that is fetched at its first use. Each value is read by the type of its field of the input as a person writes it: a number with the signs of the language, a date in the standard form or in the order of the language, in the zone of the project where it names none, yes or no, and a choice by its value or by its word. Every row passes the change's types, its rules and its triggers: the import writes nothing that the change does not. A page of records (`limits.workPage`, 1,000) is one write, with the place of the import: an import that stops goes on from its last page when the same command is given again. Of an app that keeps a data file for each tenant, where a page cannot be one write, each record is a write of its own, which notes in the file it wrote the record it is at: a record written before a stop is never written twice. Each refused record is listed in `<file>.refused.csv`, with its line and the field that does not fit and why; of a spreadsheet the line is the sheet and its row, as `Members:12`. While it runs a line says how many records it went through. It answers `{ "records": 1000, "imported": 996, "refused": 4, "refusedFile": "<file>.refused.csv" }`, and with `--dry` the same with `"dry": true`, as the import would go.

`code.T0002` for a word that is missing, for a file of a form that no import reads or that does not read as its form, for a language that the runtime does not know, for a moment that does not read or that is before the oldest backup the archive rests on, for `rows` of a tenant table that names no tenant, and for `rows` of a word that names no table, which is told with the tables there are, `code.T0001` for `--with` that names no change, `code.T0016` where the reader of spreadsheets cannot be fetched, `code.T0009` for a file that is no backup, with the data left as it was, and for a moment in a gap of the archive, which it names, or after the file of one tenant was put back alone and before the next backup, and `code.T2028` for `restore --at` of an app whose archive is off.

## See also

`topic.commands`, `option.project.backups`, `word.s3`, `handle.importFile`, `command.logs`
