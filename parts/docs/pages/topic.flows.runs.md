# Looking at runs

This page says what the check says of a flow, and how its runs are looked at.

## What the check says of a flow

| Code | Found |
|---|---|
| `code.T5001` | Work outside a step, and a word that is drawn there |
| `code.T5002` | A step whose promise is not awaited |
| `code.T5003` | A warning: a step name that runs which have not ended depend on is gone or renamed |
| `code.T3004` | A flow that the pages may call and that neither runs as its starter nor states `system`, and an action with no `system` that waits for a flow with full access |
| `code.T7009` | A flow that the pages may call and that states no `input` |

## Looking at runs

`tent runs` lists the runs of the app, and `tent runs show <id>` prints one with each step. `tent run daily --times 2031-01-01T00:00:00Z 2031-01-08T00:00:00Z` makes up a schedule (`command.run`): one run for each of its times between the two moments, handed that time as `event.at`, in order, held by `together` and `pace`; with `--dry` it lists the times and starts nothing, and more than 100 runs it starts only with `--yes`. A schedule that missed times while the machine was off fires once, so a flow that must make up each one is started so. A run is answered, stopped, moved to the version that runs now, or begun anew from one of its steps with `command.runs`. Code with full access does the same through `handle.runs`.

Many runs at once: `tent runs stop --flow billing --state waiting --since <moment>` and `tent runs replay --flow billing --state failed --from charge` say how many runs they would act on, and act with `--yes`; `runs.stopAll` and `runs.replayAll` do it in code. `tent runs pause billing` and `runs.pause('billing')` hold a flow on every machine and across a restart: its new starts are kept as `queued` and its runs that come due stay waiting, so nothing is lost, until `resume` lets them go in their order. `tent runs` names a paused flow first.
