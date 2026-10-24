# Your data, and the way out

What an app of Tent.js is made of, in forms that other tools read: its data is SQLite files, its pages are React, and its project is TypeScript files under git. This page says where each lies, what carries it out, and what is written in the framework's own words, which another framework would have written in its own.

## The data is SQLite files

An app keeps its data in its data folder, `.tent/` of the project in development and the folder that `--data` names on a server (`topic.moving`):

| File | Holds |
|---|---|
| `data.db` | Every table of the app, each a table of SQLite under its own name, beside the engine's own, whose names start `_t_` |
| `tenants/` | A file of SQLite for each tenant, where a table keeps one for each (`option.table.tenant`) |
| `files/` | The bytes of each file that was uploaded or made, where the app keeps its files on the computer (`adapter.FileStore`) |
| `history.db` | The history of the project's files (`topic.history`) |
| `logs.db` | The log: calls, errors and slow queries |

Any tool that reads SQLite opens them: the `sqlite3` program, a viewer of SQLite files, Python's `sqlite3`, the runtime's `node:sqlite`. A row holds its `id` as text, its `createdAt` and `updatedAt`, and a column for each of its table's columns: a text as text; a number as a number; `true` and `false` as 1 and 0; a moment as whole milliseconds since 1970; a list, an object and a `json` as JSON text; and a link as the inside number `_n` of the row it links to, which a `JOIN` on `_n` reads. A vector lies in a table of its own, `<table>__<column>`, as raw bytes, and a `sealed` column and the secrets are written with the key of the secrets, which opens them alone.

The engine writes the files while it runs, so a tool reads a backup, or the live file without writing: a row that is written past the engine passes none of the app's rules, and is in none of its history.

## The pages are React

A view of a screen is a React component, and so is a component of the project: JSX, hooks, and any package of npm, with the look of the project's CSS (`topic.screens`, `topic.look`). What a view writes is what React writes anywhere, so a view and its CSS go with the project into any app of React, with the parts of `tentjs/ui` it uses written anew there.

## What carries it out

| To take | Way |
|---|---|
| The rows of a table, as JSON | `tent data rows <table>` (`command.data`), with `--json` |
| The whole data, as a file of SQLite | `tent data backup`, which writes a snapshot into `backups/` of the data folder, safe while the app runs, and restores it once as a test |
| What the app holds of one person | `tent data user export <id>`: their row of `users` and every row they own, as JSON |
| The public pages, as plain files for any host | `tent export` (`command.export`) |
| The history of the project, into git | `tent history export --out <folder>`: each point as one commit (`command.history`) |
| The files that were uploaded | The folder `files/`, or the store that holds them |

The way in is as plain: `tent data import <file> --with <change>` hands each record of a file of CSV, JSON or a spreadsheet to a change of the app.

## What is written in the framework's words

The project is TypeScript files in its folder, and a file that imports none of `tentjs`, `tentjs/ui` and `tentjs/cli` is a helper of plain TypeScript that goes anywhere. What the framework's own words hold, another framework writes in its own:

| Written with | Is, elsewhere |
|---|---|
| `table` and its columns, rules and `search` | The schema of a database, with its migrations and its rules of rows |
| `query` with `rows`, a plan, and `change` with `set` | Queries of SQL or of an ORM, with their checks of who may |
| The `run` of a function | Plain TypeScript, which reads and writes through `db` (`topic.db`): its logic goes with it, and each read of `db` is written anew |
| `action`, `flow`, `agent`, `model`, `service`, `incoming`, `route` | Handlers of a server, a queue of jobs, the clients of an AI and of other services |
| `screen` around a view, `read`, `Link`, `Form`, `Image` and the hooks of `tentjs/ui` | The routes and the loading of data of another framework of React, its links and forms |
| `project`, `messages` and the access of each definition | Its settings, its language files and its checks |

Where the framework's words are our words alone, the definition is stored as data in the description of the build, `description.json`, which `tent map` prints as an outline: so a program reads every table, function and screen of the app, with its rules, to write it out in another form.

## See also

`topic.moving`, `command.data`, `command.export`, `command.history`, `topic.db`, `topic.screens`, `topic.engine`
