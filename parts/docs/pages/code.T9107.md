# T9107 history-missing

A point or the bytes of a file that the history was asked for is not there, or what was sent does not fit the id it was sent under. Nothing was written.

## Details

| The case | What it names |
|---|---|
| A word that names no point: no pointer, no name, and no first 8 or more characters of an id | The word |
| A point that was dropped: it keeps its place in the chain and holds no files, so there is nothing to go back to, to compare with or to write | The point |
| The bytes of a file of a point that the history does not hold | The fingerprint of the bytes, and the path of the file |
| A point from another history whose id is not the id that its content gives | The point |
| Bytes from another history that do not fit the fingerprint they were sent under | The fingerprint |
| A point from another history whose parent is neither here nor among what was sent | The point |
| A point from another history that holds a file under what is no path: one that leaves the folder, or that lies in `.tent/` | The point and the path |

A point of the kinds `save` and `command` is dropped once it is older than `historyKept` in `limits` of the project, 30 days where none is stated. A named point, a published one, a point that a pointer stands on and the point that two branches share are never dropped.

A caller is sent the point or the fingerprint in `fields`, under `point` or `blob`.

## The fix

Name a point that `tent history` lists: `now`, a name, or the first 8 or more characters of an id. To keep a state for longer than `historyKept`, give it a name with `tent history save <name>`.

## See also

`command.history`, `topic.history`
