# `tent run`

Calls a function of the app and prints what it answered, with the lines that its code wrote into the log, or makes up the schedule of a flow with `--times`. With no engine running for the project it builds the project and starts one for the length of the command, on the development data.

## Usage

```
tent run <function> [--with <json>] [--as <who>] [--data <folder>]
tent run <flow> --times <from> <to> [--dry] [--yes] [--data <folder>]
```

## Options

| Option | Means |
|---|---|
| `--with <json>` | The input of the function, as JSON. Left out, it is `{}` |
| `--as <who>` | The caller: the id of a user, `nobody` or `system`. Left out, it is `system` |
| `--times <from> <to>` | Starts one run of the flow for each time of its schedule between the two moments, both taken, each handed its time as `event.at`, in their order and held by its `together` and `pace` |
| `--dry` | With `--times`: lists the times and starts nothing |
| `--yes` | With `--times`: starts more than 100 runs, which it starts only so |
| `--data <folder>` | The data folder of the engine to ask. Left out, it is `.tent/` of the project |

## Example

```
tent run openOrders --with '{"limit":5}' --as 01m4ssnmz8f11sy43ctwdn5nvd
```

## Output

With `--json`:

```json
{ "ok": true, "value": { "value": [], "lines": [{ "at": 1791878400000, "level": "info", "message": "listed", "name": "openOrders" }] }, "findings": [] }
```

With `--times`: `{ "flow", "times", "runs", "done" }`: the times in the standard form, the ids of the runs it started, none with `--dry`, and whether it started them.

The call passes the rule of the function, its input types and the rules of the tables, as a call from a page does. A call that is refused is a finding with the code of the refusal, and the command ends with 1.

## Errors

`code.T0001` for a name that is no function, `code.T0002` for an input that does not fit, `code.T0006` and `code.T3101` for a caller that the rule keeps out, `code.T2103` for an id after `--as` that names no user, and `code.T0014` where an id is named and the app has no `users` table.

## See also

`topic.commands`, `command.logs`, `command.start`
