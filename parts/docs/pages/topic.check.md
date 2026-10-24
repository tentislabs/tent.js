# The check

The check builds the description of a project, carries out every rule on it, and answers every finding at once. It never stops at the first, and it changes no file but the type list of the project. `checkProject` of `tentjs/check` does it, and `tent check` is a few lines over it.

```ts
import { checkProject } from 'tentjs/check'

const { findings, forms, why } = await checkProject('./my-app')
```

| It answers | Holds |
|---|---|
| `findings` | Each with its level, its code, its file and line, its definition, a sentence, the fix, and the command that explains its code |
| `forms` | For each definition, `'plain'` or `'code'`, and no more. `tent check --json` prints it as `definitions`, with `why` beside it |
| `why` | For each code definition, what made it code: the option, the thing, and its line |

A program that builds each save runs the two halves of the check apart, as `command.dev` does. `rulesOver({ description, source })` carries out our own rules over what a build just read, and reads no file. `keepTypes(folder, source)` starts the type checker and keeps it running: `next()` answers what its next pass reported, and `stop()` ends it.

## The two layers

Our own rules read the description and the source, and finish in well under a second. The type checker then reads the whole project, as a program of its own, with `tent.d.ts` written anew first. Each of its findings is `code.T8000`.

## The levels

An error blocks a build: no bundle is written. A warning and a note do not.

## The groups

| Codes | Group |
|---|---|
| `T1...` | Shape: found while the project is built and described |
| `T2...` | Data: `code.T2005`, `code.T2006`, `code.T2007`, `code.T2008`, `code.T2009`, `code.T2010`, `code.T2011`, `code.T2012`, for a table that keeps a data file for each tenant `code.T2013` and the note `code.T2014`, and what the data of a running app says of a table change, `code.T2001` to `code.T2004` |
| `T3...` | Safety: `code.T3001`, `code.T3002`, `code.T3003`, `code.T3004`, `code.T3005`, `code.T3006`, `code.T3009` |
| `T4...` | Queries: `code.T4001`, `code.T4002`, `code.T4003`, `code.T4004`, `code.T4005` |
| `T6...` | Screens: `code.T6007`, `code.T6008`, `code.T6009`, `code.T6011`, `code.T6012`, `code.T6013`, `code.T6015`, `code.T6018`, `code.T6021`, `code.T6022`, `code.T6023`, `code.T6032` and the warnings `code.T6025`, `code.T6030` and `code.T6031`. They read a view as its file writes it, and hold what the type checker cannot see: an address, a cache, an entry of `data`, a form's function |
| `T8...` | Types: `code.T8000`, `code.T8001`, `code.T8002` |
| `T9...` | The project: `code.T9002` |

The other groups arrive with the parts they hold: flows, and connecting out.

The type checker reads the screen files too. Where it says that a name does not exist on a row, the finding ends with the table and its columns, as: The table `customers` has the columns `id`, `createdAt`, `updatedAt` and `name`.

## Options

`facts` are what only a running app knows, as the findings of a table change against its data. The check opens no database: whoever calls it passes them in. `tent check` asks the engine that runs on the data of the project, and `readFacts` of `tentjs/engine` where none runs. The rules of `code.T2001` to `code.T2004` pass on what the facts hold, and add the place of the table in the source.
