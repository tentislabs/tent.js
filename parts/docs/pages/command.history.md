# `tent history`

Lists the points of the history of the project, records a named one, compares two, goes back to one, makes and merges branches, and writes points out as commits of git. A point is a full snapshot of the files of the project (`topic.history`).

## Usage

```
tent history [--newest <n>]
tent history save <name>
tent history compare <a> <b>
tent history back <point>
tent history branch [<name>] [--switch]
tent history merge <branch> [--yes] [--unchecked]
tent history merge --settle
tent history export --out <folder> [--kinds <kinds>]
```

A point is named by `now`, by its name, or by the first 8 or more characters of its id.

While `tent dev` runs, it holds the history open, and each of these asks it. It records a point of the kind `save` after every build that a save caused: a broken state too, as not checked. Two saves within five seconds are one point (`historyJoin` in `limits` of the project). With no `tent dev` running, a command opens the history itself and records the files alone, with no mark of the check. `tent new` records the first point of a new project, and `tent add` records one point of the kind `command` before it installs and one after.

## Options

| Option | Means |
|---|---|
| `--newest <n>` | Of `tent history`: how many points are listed, newest first. Thirty where none is given |
| `--out <folder>` | Of `export`: the folder the commits are written into. It is empty, or holds what an earlier export wrote, to which the newer points are added |
| `--kinds <kinds>` | Of `export`: the kinds of point to write, with commas between or given several times. The named, the published and the merge points where none is given |
| `--switch` | Of `branch`: goes to the branch, and makes it first at `now` where it is not there |
| `--yes` | Of `merge`: merges. Without it the command prints what the merge would change and what would clash, and changes nothing |
| `--unchecked` | Of `merge`: merges a point that did not pass the check on this computer, which is how two people share work that does not pass yet |
| `--settle` | Of `merge`: records the point of a merge whose clashes a person settled |
| `--data <folder>` | The data folder that holds `history.db`. Left out, it is `.tent/` of the project |

## Example

```
tent history save before-the-sale
tent history compare before-the-sale now
tent history back before-the-sale
```

`compare` prints one change to a line, in the terms of the app:

```
table clients: renamed from customers
table orders: column "total": max changed 100 -> 500
table orders: column "note" added (text, optional)
query openOrders: plan.limit changed 50 -> 100
flow bigOrder: step "follow up" added
action refund: code changed (12 lines)
file assets/logo.png: changed
```

A definition, a column and a step are matched by their names and by `was`. A screen and a component, whose view is code, are changed where their text changed. What is missing on one side and new on the other is removed and added, and never guessed to be a rename. A point that did not build is compared file by file.

`back` records the present first, writes the files of the point, and records a point of the kind `back`: so going back can itself be undone. The data follows the files. A table or a column that the older files do not know, because it was added since, is retired and not dropped, and going forward again revives it with its values. One that was renamed since, with `was`, takes its old name again with its values. Where the data cannot follow, as rows that do not fit what the older files require, no file changes and the command ends with 2 and the code of why, T2001 to T2004. Where a file of the point would be written over one that no point holds, or through a link, no file changes and the command ends with T0013, which names each such file. Rows that `tent data clean` dropped are not brought back. With no `tent dev` running, `back` runs the project in development for the length of the command.

A branch is a pointer. A project starts on `main`, which `now` follows. `branch <name>` makes one at `now`, and `branch` alone lists them, with a star at the one that is followed. A name holds no colon and no white space, and is not `now`, `on` or `live`. `branch <name> --switch` records the present, writes the files of that branch as going back does, and follows it; the data follows the files.

`merge <branch>` compares both sides with the newest point they share. What only one side changed is taken from it. A plain definition that both changed merges one field at a time, and is written anew at its place in its file, with no other character of the file changed: its own comments are gone, which the merge says. A code definition, and a file that holds no definition, merge line by line. A clean merge is built and checked, and its point marked with what was found. A clash - both changed one field to two values, one removed what the other changed, both changed the same lines - leaves ours in its file and is written into `tent.clash.ts` in the root of the project, numbered, with both definitions under names of their own:

```ts
// tent.clash.ts - written by `tent history merge`. Put the definition you want into its own file, then remove this file.
// 1. query openOrders (functions/orders.ts): plan.limit - ours 50, theirs 100, before 20
export const openOrders__ours = query('openOrders', { /* ... */ })
export const openOrders__theirs = query('openOrders', { /* ... */ })
// 2. file assets/logo.png: both changed it. Theirs is kept beside it as assets/logo.png.theirs
```

No build reads `tent.clash.ts`, and no point holds it or a `.theirs` file. Put the definition you want into its own file, remove the clash file and every `.theirs` file, and type `tent history merge --settle`.

`export` writes each point as one commit, oldest first, with the `git` program of the computer: the name of the point as the message, its writer as the author. Git holds the files. The marks of the check and the changes in the terms of the app are not in it.

## Output

With `--json`:

```json
{ "ok": true, "value": { "now": "1e201154201875ad3b445f8082ae917a", "points": [{ "id": "1e201154201875ad3b445f8082ae917a", "at": 1791878400000, "by": { "kind": "person" }, "kind": "named", "name": "before-the-sale", "checked": true, "files": 12 }] }, "findings": [] }
```

`branch` answers `{ on, branches }`, each branch with the id of its point, and with a name `{ branch, point, on, branches }`; with `--switch`, `{ point, on, checked, version, findings }`. `merge` answers `{ changes, lines, clashes, merged }` with `merged: false` where `--yes` was not typed, and once it merged also `point`, `checked`, `version` and `findings`, with `clashFile` where something clashed. `merge --settle` answers `{ point, checked, version, findings }`.

`save` answers `{ point }`. `compare` answers the list of the changes, each as `{ change, what, name, was, path, from, to, lines }` with the fields that apply. `back` answers `{ point, version, note, findings }`: the `back` point, the version that runs, what cannot be brought back, and what the build of the older files found. `export` answers `{ commits, note }`.

## Errors

`code.T9107` for a word that names no point, and for a point that was dropped. `code.T0013` from `back` for a file that no point holds and that would be written over, and from `export` on a computer with no `git`, and for a folder that holds what no export wrote. `code.T2001` to `code.T2004` from `back` where the data cannot follow the files of the point. `code.T0002` for a word that is missing, and for a name that cannot name a branch or names one already. `code.T9101` from `merge` for a side that did not pass the check, or is a merge with clashes that are not settled. `code.T9102` from `merge --settle` while `tent.clash.ts` or a `.theirs` file is there. A command that fails ends with 2.

## See also

`topic.history`, `command.dev`, `topic.source`
