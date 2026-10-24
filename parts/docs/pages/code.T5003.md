# T5003 step-name-gone

A warning. Runs that have not ended depend on a step name, and the code of their flow no longer holds it: the step is gone or renamed.

## Details

A run keeps the version it started with, so such a run still ends on its old code, and nothing is refused. The warning says that the run can no longer be moved to the new version: `tent runs move` holds each saved step of a run against the step names of the version, and refuses where one does not match.

The check knows the names from the data of the app: `tent check` reads them from the engine that runs, or from the data folder that `--data` names. For each flow they are the names of the steps that its unfinished runs saved or wait at. A flow whose runs have not ended and which is gone from the project is reported at the project. A flow some of whose steps are named in code that the build could not read is passed over.

## The fix

Keep the name of the step until the runs that depend on it have ended. Or leave them: they end on the version they started with. A run that must not end there is stopped with `tent runs stop`.

## See also

`topic.flows`, `command.runs`, `command.check`
