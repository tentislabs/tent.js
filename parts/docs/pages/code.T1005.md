# T1005 both-imports

A file imports two of `tentjs`, `tentjs/ui` and `tentjs/cli`. A file belongs to one side: a backend file, a screen file or a command file. That one rule keeps backend code and secrets out of the browser, and out of a terminal on somebody's computer.

## Details

An `import type` does not count: a screen file may import a type of `tentjs`. A screen file uses a query, a change or an action by importing it from its backend file, which is no import of `tentjs`.

The same code stands for a file of the browser's side that asks for a backend file as its text or as an address, and not as code: with `?raw` or `?url` after its name, by a pattern of files with either, by an address made from the file's own, `new URL('../functions/orders.ts', import.meta.url)`, or by `url()` in a style file. A backend file reaches a browser as the names of its definitions alone, never as its text or its bytes, so the build ends on the line that asks, and writes no bundle. It holds for a screen file, for a helper that imports neither side, for a package and for a style file, and for a worker that is made from the address of a backend file, `new Worker(new URL('../functions/orders.ts', import.meta.url))`, however the call is written. A file is known by its real place on the disk: another case of its name, a short name of the disk, and a project that is built through a link to its folder change nothing. The starter data `seed.ts`, the makers of the adapters `engine.ts`, the file of the project and every file under `tests/` are refused as text and as an address in the same way. Asked for as code, a backend file is answered with the names of its definitions whatever stands after its name, as `'../functions/orders.ts?x=1'`.

## The fix

Move the definitions of one side into a file of their own, which imports that side alone. A helper that both sides use lives in a file that imports neither. A screen that needs something of a backend file imports its definitions by their names, and reads data through a query.

## See also

`code.T1006`, `topic.build`
