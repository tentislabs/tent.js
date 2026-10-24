# A workspace

A workspace is a folder, `<folder>/<id>/`: `project/` holds its files, `data/` its engine's folder with its data, its history and the mail of its test side, and `workspace.json` its record, `{ format, id, owner, name, createdAt, live }`. There is no table of them: a workspace is moved, backed up and removed as a folder.

| Member | Does |
|---|---|
| `create({ owner, from, name })` | Makes a workspace from a template or from the files of another workspace |
| `get(id)`, `list({ owner })`, `remove(id)` | Reads and removes them |
| `run(id)` | Builds what changed and opens the app of the workspace in the mode `test`, under its address: the same app while it stays open |
| `rebuild(id, by)` | Builds and checks it, makes what passed its running version, and records a point of the history |
| `history(id)` | Its history |
| `values(id, o)`, `mail(id)` | Its secrets and settings, and the mail of its test side |
| `publish(id, o)` | Makes it live where `live(id)` says |
| `onRequest`, `close()` | What `createWorkspaces` puts in front of the engine, for a program that calls it its own way, and the end of all of them |

Each workspace has its own data: its rows, its files, its secrets and its runs lie in its own folder, and its app is a caller of nobody else's. There is no address by which one app reaches another's data. The test side of a workspace is shown in the mode `test`, which shows an error in full, as `development` does: a product that lets strangers open the test address of a workspace says so to its users.
