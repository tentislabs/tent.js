# T2015 filled-misused

A column that work fills, as its `by` states it, cannot be filled so.

## Details

The work that fills a column is handed what `input` of its `by` names, and nothing else, and runs as the app: what it was handed is all its value may rest on. The check reports:

- a `by` that names what is no action, `python` or model;
- an `input` that names no column of the row, or reads through a link into another file, which one write cannot reach;
- an answer, or the field that `take` names, that does not fit the column;
- a definition that fills a column and states no `system`, or states `rows`;
- a filled column that is required: until its work made its value, it stands empty;
- a ring of filled columns, each made from the next;
- a filter with `filled` on a column that states no `by`.

## The fix

State `optional: true` on the column, name an action that states `system` with its reason, and name in `input` the columns of the row, or of a row it links to in the same file. Work that needs more than its row is a flow on `table.changed` that writes the column itself.

## See also

`topic.workers`, `command.filled`
