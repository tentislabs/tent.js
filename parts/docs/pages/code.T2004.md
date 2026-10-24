# T2004 rename-not-stated

One name is gone and another is new, with no `was`: a table of the project, or a column of one table.

## Details

A name is what a table and a column are known by, so the data cannot tell a rename from a removal with an addition. Nothing is applied until the code says which it is.

## The fix

Where it is the same thing under a new name, state `was` on the new one, with the old name: its rows go on. Where the old one was removed on purpose, name it in `removed`.

## See also

`option.table.was`, `option.table.removed`, `option.project.removed`
