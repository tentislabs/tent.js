# `tent runs`

Lists the runs of the flows of the app, and with a second word shows, moves, replays, answers, stops or undoes one, stops or replays many at once, and pauses and resumes a flow. It asks the engine, and starts one for the length of the command where none runs.

## Usage

```
tent runs [--of <tenant id>] [--all] [--data <folder>] [--at <server>] [--insecure <host>]
tent runs show <id>
tent runs replay <id> --from <step>
tent runs move <id>
tent runs approve <id> <step>
tent runs refuse <id> <step>
tent runs stop <id>
tent runs stop --flow <flow> [--key <key>] [--state <state>] [--since <moment>] [--before <moment>] [--yes]
tent runs replay --flow <flow> --from <step> [--key <key>] [--state <state>] [--since <moment>] [--before <moment>] [--yes]
tent runs pause <flow>
tent runs resume <flow>
tent runs undo <id> [--started] [--dry]
```

## Options

| Command | Does |
|---|---|
| `tent runs` | Lists the flows that are paused first, and then the 200 newest runs, the newest first: the id of each, its flow, its state, its version, and the step it stands at |
| `runs show <id>` | Prints one run in full: who started it, what it was handed and answered, and each step with its state and its result |
| `runs replay <id> --from <step>` | Starts a new run on the version that runs now. It reads the saved results of the run before the named step, and carries out that step and each one after it |
| `runs move <id>` | Moves a run that has not ended to the version that runs now, where each step it saved still stands there under its name. Where one does not, the run stays, and the answer names the step |
| `runs approve <id> <step>` | Says yes to a step that waits for an answer |
| `runs refuse <id> <step>` | Says no to it. The run goes on, and its flow reads the no |
| `runs stop <id>` | Stops a run that has not ended |
| `runs stop --flow <flow>` | Every run of the flow that has not ended and fits the words beside it: it says how many, and which, and stops them only with `--yes` |
| `runs replay --flow <flow> --from <step>` | Every run of the flow that fits the words beside it, each replayed as `runs replay <id>` replays one: a run that saved no step of that name reuses every step that was done. It says how many first, and replays them only with `--yes` |
| `--key <key>`, `--state <state>` | Of the two above: the runs of one key (`option.flow.key`), and of one state: `queued`, `running`, `waiting`, `done`, `failed` or `stopped` |
| `--since <moment>`, `--before <moment>` | Of the two above: the runs that were started at or after a moment, and before one, each in the standard form, `2031-01-01T09:00:00Z` |
| `--yes` | Of the two above: act. Left out, nothing is done |
| `runs pause <flow>` | Pauses a flow on every machine and across a restart: its new starts are kept as `queued`, and its runs that come due stay waiting. A run at work goes on to its next wait |
| `runs resume <flow>` | Lets a paused flow go: what waited goes, in its order |
| `runs undo <id>` | Takes back every row the run wrote, as `undo.run` does (`handle.undo`), and with `--started` what the runs it started wrote. It answers `{ undone, clashes, outside }`, and with `--dry` the same with nothing changed. Its own change names no one: it is the system's |
| `--of <tenant id>` | Of `tent runs`, in an app that keeps a data file for each tenant: the runs of that tenant's file. Left out, the list is of the shared file |
| `--all` | Of `tent runs`: the runs of every file, each file of a tenant that is closed too, the newest first |
| `--data <folder>` | The data folder of the engine to ask, for each of them. Left out, it is `.tent/` of the project |
| `--at <server>` | For each of them: the app on a server, by the name or the address that `tent login` kept its key under. The key is one of the right `operate`, which `tent access key add <name> --right operate` makes there: it reaches the run commands and the log of the app, and nothing else. Each act on a run is kept in the log of the server with the id of the key. A run shown to it holds no value of the app: each step's name, state, time and code, and the trace, but not what the run or a step was handed or answered |
| `--insecure <host>` | With `--at`: reaches that host over a plain connection, for two machines on a network of their own |

## Example

```
tent runs
tent runs approve 01m4ssnmz8f11sy43ctwdn5nvd approval
tent runs replay 01m4ssnmz8f11sy43ctwdn5nvd --from 'send'
tent runs replay --flow billing --state failed --since 2031-01-01T00:00:00Z --from charge --yes
tent runs pause billing
tent runs --at shop.example.com
```

## Output

With `--json`:

```json
{ "ok": true, "value": { "runs": [{ "id": "01m4ssnmz8f11sy43ctwdn5nvd", "flow": "bigOrder", "state": "waiting", "version": "v-5f2a", "step": "approval" }] }, "findings": [] }
```

| Command | Its value |
|---|---|
| `runs show` | The run as `runs.read` answers it |
| `runs replay` | `{ "run", "from", "of" }`: the id of the new run, the step, and the run it reads |
| `runs move` | `{ "run", "version", "moved" }`, and `step` where it did not move |
| `runs approve`, `runs refuse` | `{ "run", "step", "approved" }` |
| `runs stop` | `{ "run", "state" }` |
| `runs stop` and `runs replay` of many | `{ "count", "runs", "done" }`: how many runs fit, their ids, and whether it acted; a replay that acted adds `started`, the ids of the new runs |
| `runs pause`, `runs resume` | `{ "flow", "paused" }` |
| `tent runs` with a flow paused | `paused`, the names of the flows that are paused, stands before `runs` |

## Errors

`code.T0001` for an id that names no run, and for a name that is no flow. `code.T0002` for a step that the run does not wait at, for one that was answered already, and for work on many runs with no `--flow`, a state that is none, or a moment that does not read.

On the computer of a reader the list and `runs show` are answered from its own data. Each other command is the writer's: on live data it is `code.T0030`, with the address of the writer in its fix, and on test data the reader sends it to its writer.

## See also

`topic.flows`, `handle.runs`, `code.T5003`
