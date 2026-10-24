# `mcp` of `service`

Marks the service as an outside MCP server, whose tools an agent may be given.

## Value

`true` for a server at `url`, or `{ command, env, per, keep, model }` for one that is a program the engine starts. False when left out.

| Field | Means |
|---|---|
| `command` | The program and its words, as they are written: it is started when the app opens, in the folder of the bundle, with no shell, and started again when it ends by itself. `url`, `auth` and `headers` are not stated beside it |
| `env` | What the program's environment holds beside the plain one, each value a text or a secret |
| `per` | `'user'` starts one program for each user who needs it, which is ended when it was not used for `limits.pythonStopAfter` (10 minutes). Left out, one program serves every user of the app |
| `keep` | `'run'` keeps the server's own session for the length of a run, for a server that holds a state for its client, such as a browser it drives. Left out, nothing is kept between calls |
| `model` | The model that answers a call of a model that the server makes on its behalf, counted on the run's `perRun`. Left out, such a call fails with `code.T7115` |

`tent mcp approve <service>` asks the server for its tools, shows them, and writes them with their fingerprints into `mcp.lock.json` in the root of the project; the build makes each approved tool a call of the service, `<service>.<tool>`, which code calls with its input, `await board.listBoards({ words: 'open' })`, typed in `tent.d.ts` by the schema of the tool's input and answering `unknown`. An agent that names the service in `tools` is offered each approved tool under that dotted name, and one tool alone by naming it: `board.listBoards`. A tool of an outside server sends data out, so it asks a person first unless `trust` names it or its service.

The engine looks at the tools again when the app opens and every `limits.toolsLook` (1 day), and for a server with `oauth` at the first run of a day, with that run's user. A tool that is not as it was approved, or is gone, is held back by itself: it is not offered, and a call of it is `code.T7112`, until a version built after a new approval runs.

The server is asked in the newest form of the standard, and in the older one where it does not know the newest. An answer reaches the model as the tool's typed answer, or its text; a link in it is told as its address and never fetched. A picture or a sound in it is kept as a file of the kind its bytes say: a model that takes pictures is given the picture, and any other is told the id of the kept file. A tool's own error words reach the model as `Error T7115:` and those words. A question with yes and no that the server puts is asked of the run's starter; anything else it asks for is `code.T7115`.

A server with `auth: { oauth: { discover: true } }` says where it signs people in, in its own documents, which the engine reads when the app opens and once a day. The app names itself to it by the document `/_t/connect/<service>/client`, or registers once, where the server takes no document and on this computer.

## Example

```ts
export const board = service('board', {
  url: 'https://board.example.com/mcp',
  mcp: true,
  auth: { bearer: secret('BOARD_KEY') },
})
```

## See also

`word.service`, `command.mcp`, `topic.mcp`, `code.T7112`
