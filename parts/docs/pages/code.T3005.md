# T3005 unreachable-table

No rule lets anyone read a table, and nothing of the project reads or writes it. It is a warning.

## Details

A rule that is left out means `'nobody'`, so a table with no `read` rule is read by code with full access alone. Where no function, no rule and no seed names the table either, its rows can be neither written nor read. The table `users`, which the engine reads itself, is not held to this.

## The fix

State a `read` rule, or use the table in a function. A table that is no longer needed is taken out, and named in `removed` of the project.

## See also

`option.table.access`, `option.table.removed`, `word.table`
