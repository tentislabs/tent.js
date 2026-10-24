# T2002 column-gone

A column that the data holds is gone from its table, and `removed` of the table does not name it.

## The fix

Name the column in `removed` of its table: it is then kept and no longer used, so going back a version loses nothing. Where the column goes on under a new name, state `was` on the new one.

## See also

`option.table.removed`, `code.T2004`
