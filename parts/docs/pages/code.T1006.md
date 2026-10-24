# T1006 helper-exported

A backend file exports something that is no definition: a function, a value, a class, or a default. A backend file exports only definitions, since a screen file that imports it is handed a record of each definition and nothing else of the file.

## Details

A type is no export of this kind: `export type` and `export interface` are gone when the file runs.

## The fix

Take `export` away where only this file uses the helper. A helper that other files use lives in a file of its own, which imports neither `tentjs` nor `tentjs/ui`.

## See also

`code.T1001`, `code.T1005`, `topic.build`
