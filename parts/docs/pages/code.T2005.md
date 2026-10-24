# T2005 link-to-missing-table

A `link` names a table that the project does not hold. A link is a real link between two tables, so the store could not make it.

## Details

The check finds it in the columns of a table, and in an input and an output of a function, also inside a list or an object there.

## The fix

Name a table of the project: `link('customers')`. Where the table is one that was renamed, name it by its present name.

## See also

`word.link`, `word.table`
