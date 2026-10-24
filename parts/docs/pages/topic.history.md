# The history

The history of a project is a chain of points, each a full snapshot of the files of the project. It is one file, `history.db`, in the engine's own folder. `openHistory` of `tentjs/history` opens it, and `tent history` is a few lines over it.

```ts
import { openHistory } from 'tentjs/history'

const history = openHistory('./my-app/.tent')
const point = history.record('./my-app', { by: { kind: 'person', id: 'ada' }, kind: 'named', name: 'before the sale' })
history.back('./my-app', 'before the sale', { kind: 'person', id: 'ada' })
history.close()
```

Every member answers at once. One program writes the file, and whoever opened it closes it. Losing `history.db` loses the history and never the project: a new one starts at the files as they are.

## A point

| Field | Holds |
|---|---|
| `id` | The first 32 characters of the fingerprint of the record `{ at, by, files, kind, name, parents }`, with its keys in order and no spaces. The same point has the same id on every computer |
| `parents` | The point it was recorded on, and for a merge both sides |
| `at`, `by`, `kind`, `name` | The moment, the writer as `{ kind, id }` with `kind` as `'person'`, `'ai'`, `'tool'` or `'server'`, what made the point, and its name where it has one |
| `files` | Each file by its path with forward slashes, with the fingerprint of its bytes. A point that was dropped has none |
| `checked`, `description`, `note` | What this computer found of the point: whether it passed the check, the fingerprint of the description it built to, and a note. None of the three is part of the id |

The kinds are `save`, `command`, `named`, `published`, `back`, `merge` and `turn`.

A point holds every file of the folder of the project and of its `roots`, but for `.tent/`, a `.git` folder or file at any depth, `tent.clash.ts`, a file that ends in `.theirs`, what `history: { leave }` of the project names, and a file larger than `historyFileSize` in `limits` of the project, which the note of the point names. `leave` is `['node_modules/']` where none is stated. A pattern that ends with `/` names a folder with all that lies in it, and any other a file; one that holds no other `/` is a name and fits at any depth, with `*` for any run of characters, and one that does is a path from the folder of the project. A file of a root is held as `roots/<its place in the list>/<its path there>`. A link is no file of the folder, and is passed over. The rules are read from the description that a point is recorded with, or else from that of the newest point that holds one. The history and a git repository that lies in the same folder know nothing of each other: going back moves no branch of git. A name of the engine's own folder or of git is matched in any case, since a disk may hold `.TENT` and `.tent` as one.
