# T7016 held-way-out

`hold` of `project` names a host, a program or a native module that the code of a held app may reach. The check notes each one, so that whoever reads the check sees every way out the hold leaves open.

## Details

A note stands for each entry of `hold.net`, `hold.programs` and `hold.native`. The note names the entry and what it opens: a host that `fetch` may reach, a program the engine may start for the app, or a native module the room may load. A `native` entry lifts the loading of native code for the whole room, which runs outside the permission model, so its note says so.

## The fix

Nothing to mend where each way out is meant. Take an entry out of `hold` where the app does not need it.

## See also

`option.project.hold`, `code.T0035`
