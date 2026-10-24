# `tent mcp`

A server of MCP on this computer, for an AI that builds the app with you: it offers the project's commands as tools. Its client starts it, as a program, and speaks to it over its input and its output in the standard's form for such a program, one message on each line. It needs no sign-in. `tent mcp approve` asks an outside MCP server for its tools and approves them.

## Usage

```
tent mcp [--data <folder>]
tent mcp approve <service> [--as <user id>] [--data <folder>]
```

A client names `tent mcp` as the program to start in the folder of the project, as `{ "command": "tent", "args": ["mcp"] }`.

`tent mcp approve` asks an outside MCP server for its tools, through the engine, with the values of the service's auth, or with `--as` with the connection of that user. It shows each tool with its description and its input, and writes them with their fingerprints into `mcp.lock.json` in the root of the project, in place of what the file held of that service: `{ "<service>": { "tools": { "<tool>": { "about", "schema", "fingerprint" } } } }`. The build makes each a call of the service. See `option.service.mcp`.

## Options

| Option | Means |
|---|---|
| `--data <folder>` | The data folder of the engine: of `tent mcp`, the one whose mode it tells when it starts; of `tent mcp approve`, the one that asks the server. Left out, it is `.tent/` of the project |
| `--as <user id>` | Of `tent mcp approve`: the user whose connection asks a server with `oauth` |

## Output

`tent mcp` offers these tools:

| Tool | Is | Only reads |
|---|---|---|
| `tent_map` | `command.map` | yes |
| `tent_docs` | `command.docs` | yes |
| `tent_check` | `command.check` | yes |
| `tent_run` | `command.run` | no |
| `tent_rows` | `tent data rows` (`command.data`) | yes |
| `tent_logs` | `command.logs` | yes |
| `tent_shot` | `command.shot` | yes |
| `tent_history` | `command.history` | yes |

The input of each tool is the options of its command, by their names, and its answer is what the command prints with `--json`: `{ ok, value, findings }`. An input that does not fit the options is the tool's error, `code.T0002`.

The tools that need an engine reach it as their commands do: through `data` of their input, or `.tent/` of the project. So `tent_run` acts as the caller its `as` names, and as the system where it is left out. Beside an engine on live data, `tent mcp` says so on its error output when it starts.

`tent mcp approve` with `--json` prints `{ "written", "tools" }`, each tool by its dotted name.

## See also

`topic.mcp`, `topic.commands`, `command.run`, `option.service.mcp`, `code.T7112`
