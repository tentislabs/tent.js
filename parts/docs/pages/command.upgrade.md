# `tent upgrade`

Rewrites a project for the breaking changes of a newer major version, which come with the version that makes them. Within one major version nothing needs it: every project keeps working.

## Usage

```
tent upgrade
```

## Example

```
tent upgrade --json
```

It reads the line the project stands on from `engines.tentjs` of its `package.json`, records a point of the history, runs each step from that line to the one of the framework that runs over the project's files (the `tent` of the install, the newest installed, and never the older `tentjs` that the project holds, which knows no step to the newer line), records a point after them, and runs the check. What changed is printed as `tent history compare` prints it, so `tent history back` takes it back. With no step for the line of the project it says so, changes nothing, and ends with 0.

## Output

With `--json`, the two lines, the steps that ran, the changes and what the check found:

```json
{ "ok": true, "value": { "from": "1.9", "to": "2.0", "steps": ["oldTitle is title"], "changes": ["file tent.ts: changed"], "findings": [] }, "findings": [] }
```

With no step, `steps` is empty and `said` says so.

## Errors

An error of the check over the upgraded project is printed as a finding, and the command ends with 1.

## See also

`command.history`, `command.check`, `command.update`
