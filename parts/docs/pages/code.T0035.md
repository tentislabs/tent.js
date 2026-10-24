# T0035 not-allowed-out

With `hold` on, an action of the app, or a package it imports, tried to reach what `hold` does not name: a file of the engine, a connection, a program or a native module. The call fails with this code, and the engine runs on.

## Details

A held app runs its actions in a room of their own, under the runtime's permission model. In the room the code reaches data through `db`, files through `files`, the outside through `fetch`, and nothing else but through the engine. A package that opens a connection by the runtime's network modules, reads a file of the data folder, starts a program, or loads a native module is refused, and the action gets this code with the host, the program or the native module it tried.

The hold refuses a package that takes the ordinary way out. It is no wall against code written to break out of it, as the runtime says of its permission model.

## The fix

Name the host in `hold.net`, the program in `hold.programs`, or the native module in `hold.native`, each as narrow as it can be written. Where the action should not reach out at all, do without the package that does.

## See also

`option.project.hold`, `code.T7016`, `topic.fetch`
