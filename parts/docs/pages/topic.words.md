# The words

A definition is one use of one word: a top-level `export const`, made by calling the word with a literal name as its first argument and one record of options. A word only records what it is given, and the work behind it is the engine's.

## The eight backend words

| Word | Makes |
|---|---|
| `word.project` | The project: the name of the app and what belongs to the whole of it |
| `word.table` | A table, with its plans, its writes and its triggers |
| `word.query` | A read |
| `word.change` | A write: the only thing that writes a caller's data |
| `word.action` | A function that reaches outside |
| `word.flow` | Work that is saved step by step |
| `word.service` | An outside service and its calls |
| `word.model` | A model of any kind of AI |

`screen` and `component` are the two words of a screen file, which imports `tentjs/ui`.

## The helper words

| Word | Stored as |
|---|---|
| `word.agent` | A flow |
| `word.python` | An action |
| `word.route` | A route |
| `word.incoming` | An incoming call |
| `word.command` | A command of the app's own command line |
| `word.backfill` | A backfill, which the engine hands every row of its table once at the switch to its version |

## The small helpers

Each answers the plain record that is stored for it, but `start`, `emit`, `fail` and `verified`, which do their work when they are called.

| Helpers | For |
|---|---|
| `word.input`, `word.caller`, `word.col`, `word.given` | A value in a form written with values |
| `word.secret`, `word.asset`, `word.message` | A secret, an asset and a message of the language files, each by its name |
| `word.anyone`, `word.role`, `word.where`, `word.allow` | An access rule |
| `word.every`, `word.cron`, `word.event` | A trigger of a flow |
| `word.get`, `word.post`, `word.put`, `word.patch`, `word.del`, `word.request` | A call of a service |
| `word.start`, `word.emit` | Starting a flow, and sending an event |
| `word.fail` | Failing on purpose |
| `word.seed` | The starter data of a project |
| `word.verified` | Checking the signature of a request in a route |
| `word.count` | The number of rows of a group |

## What every word takes

Every word takes `was`, the old name of a definition that was renamed: nothing is ever guessed to be a rename. `table`, `query`, `change`, `action` and `flow` take `plain: true`, which holds the definition to the plain form. An option that a word does not list is refused: by the types, and when the project is described.

Every definition has a name of its own across all kinds, the project's among them (`code.T1004`), written in camelCase, and a component's with a capital first (`code.T1013`). `mail`, `files` and every name that starts with `_t_` are the framework's own, and a table is not named `system`, `sql`, `n`, `read` or `write`, the members of `db` (`code.T1009`).

## What a definition carries

Every definition carries `.definition`, its name, and `.kind`. A member of a definition or of a handle, as `slack.postMessage` and `mail.send`, is a value that carries its name too: reading it does no work, and only a call is handed to the engine. A call with no engine fails with `code.T0010`.

## The handles

`sessions`, `attempts`, `roles`, `connections`, `keys`, `grants`, `settings`, `secrets`, `log`, `passwords`, `mail`, `files`, `runs` and `verified` are imported from `tentjs`. A member of one forwards to the working object of the engine. `settings.name` and `secrets.NAME` are values.
