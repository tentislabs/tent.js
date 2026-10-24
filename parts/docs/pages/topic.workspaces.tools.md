# The project tools

The same things the commands do, as tools over one workspace: the source `project` of tools, which `createWorkspaces` offers to the engine. A run of an agent that builds is given them by a turn, or by a program that starts it with `app.start(agent, input, { as, sources: [{ name: 'project', context: { workspace: id } }] })`; the product's own code carries one out with `workspaces.tool(id, name, input, { caller, agent })`, under the policy of the agent it names, so a visual editor renames, removes and edits by the same rules as the AI. `tool`, `turn` and `undo` hold their `caller` to the workspace, as every member of the handle does: its owner, or whoever `may` lets in, and `code.T3101` for anyone else. The workspace is the one the source's context names, which no caller can set, and no input of a tool names another.

| Tool | Input | Does |
|---|---|---|
| `map` | - | The outline of the project, as `tent map` prints it |
| `read` | `{ path, from?, to? }` | The text of a file, or of its lines |
| `search` | `{ text, in?, limit? }` | The files and the lines that hold a text, in the whole project or in the folder or the one file `in` names, 100 where `limit` is left out |
| `docs` | `{ topic }` | A page of the shipped docs, by its name |
| `edit` | `{ path, find, with }` | Puts `with` in the place of `find` in one file, where `find` stands in it exactly once: otherwise `code.T9106`, with how often it stands |
| `write` | `{ path, text }` | A whole file, up to 1 MB |
| `rename` | `{ name, to }` | Renames a definition or a column (`orders.buyer`): it changes the name, adds `was`, and changes every plain place that names it. Places in code it lists in its answer and leaves |
| `remove` | `{ name }` or `{ path }` | Removes a definition, a column or a file, and states it where the framework asks: `removed` on the table, and on `project` for a table |
| `check` | - | The findings of the check |
| `run` | `{ name, input?, as? }` | Calls a function or starts a flow of the workspace's app, on its test data, as a user of the workspace, or as nobody where `as` is left out. As the system only where the policy's `also` names `runAsSystem`. Where what it calls sends data out, the person is asked first, unless the agent's `trust` names `run` |
| `rows` | `{ table, limit? }` | Rows of the test data, 100 where `limit` is left out, but for the `private` columns |
| `logs` | `{ errors?, since? }` | Calls and errors of the workspace's app |
| `shot` | `{ path, as?, size? }` | A picture of a screen of the workspace's own app, by a path of it, which the model is given as an image: no path of the product's disk |
| `history` | `{ newest? }` | The points, and what each changed |
| `compare` | `{ from, to?, name? }` | What changed between two points, `to` being the present where it is left out, for the whole app or for one definition: read from the lists kept with the points between them |
| `changedBy` | `{ name, path? }` | The newest point that changed a definition, or one field of it by its path, with its time, who made it, its kind and its turn |

A path is held to the workspace's own project, also after every link is followed and whatever its capitals (`code.T9105`), and `.tent/`, `tent.clash.ts`, `tent.d.ts` and `mcp.lock.json` are never written: the framework writes them itself; `engine.ts` is written only where the policy names `'engine'` in `also`. After each tool that writes, the file is read again as the policy says and held against it (`option.agent.policy`): a write that the policy refuses is undone, and the model is answered `code.T9105` with the rule; one that `ask` names waits for the person, and is written after their yes. Then a point of the kind `command` is recorded. Tools that write are carried out on a workspace one after another, also where a model asks for several in one step, so two edits of one file both land. A tool that fails answers its error to the model, as every tool does.
