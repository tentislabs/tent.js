# From a description back to text

A plain definition is stored whole in the description, so its text can be written from its record. Two functions of `tentjs/core` do it. They are pure: a record in, text out. A tool that changes an app uses them to write a definition anew.

```ts
import { definitionSource, fileSource } from 'tentjs/core'

definitionSource(description, 'openOrders')            // export const openOrders = query('openOrders', { ... })
fileSource(description, ['openOrders', 'markPaid'], { path: 'functions/orders.ts' })   // a whole file
```

## What is written

| Function | Answers |
|---|---|
| `definitionSource(description, name)` | `export const name = <word>('name', { ... })`, with its options one to a line in one fixed order. A type is written as its call, a reference as its helper (`input('limit')`), a plan as a chain from its table, a rule as its word, a length of time and a size in words (`'30 seconds'`, `'10 MB'`), and a `run` that was read as its arrow. A screen and a component, whose view is code, have no such text (`code.T0013`). An option that equals what holds when it is left out is not written |
| `fileSource(description, names, { path })` | A whole file: one import line from `tentjs` with the words the text uses, one for each other file of the project that it names, one for each text file, then each top-level `const` that the definitions read, then each definition, with an empty line between. `['seed']` names the starter data, and `['texts:<language>@<path>']` a language file |

Reading what was written gives the same record. A definition that a person wrote, read and written back, may be laid out differently, has its columns, its inputs and every other map in sorted order, and holds no comments.

A value that the file names is written back as its name, and never as the value it held: a top-level `const` that a body reads, a text file that the file imports, and an option of the project, `shop.options.title`. So a later change of the constant still reaches the definition.

What nobody wrote is never written: `kind`, `form`, `module`, `stepNames`, and the tables that a plain function reads.

## Laying a definition into a file that stands

`definitionSource` gives text, and a tool lays that text into a file. The description says where: `places` holds for each definition its file, and its first and its last character there, from the `e` of `export` to the closing bracket of the call, counted with one line ending.

1. Read the text that stands at the place first. A constant of the file that is read in an option, as `max: NAME_LENGTH`, a spread, and a call of a function of the file are stored as the value they gave. The record cannot give such a name back: refuse the change, and name the name and its line.
2. Two definitions of one statement, `export const a = table(...), b = table(...)`, start at one place: write and remove neither.
3. Find the place in the file as its line ends stand, and write with the line end of the file.
4. A definition that is new to its file goes to its end, after one empty line.
5. Where the text needs a word or a definition that the file does not import, add one import line after the last import line, and change no line that stands. Where a name that the text needs means another thing in the file, refuse.

## Errors

`code.T0013` for a definition that is code: a function or a flow whose arrow holds more than our words, a screen and a component, a `python`, a route, a command, a table one of whose rules is code, and a project that states `identify`, `onRequest` or `build`. Code has no text of this kind: a tool changes the text of its file. Also from `fileSource` where two of the definitions hold different values under one top-level name. `code.T0001` for a name that the description holds no definition of, and from `fileSource` for a definition that the text names and whose file the description does not say.

## See also

`topic.build`, `topic.history`, `topic.screens`
