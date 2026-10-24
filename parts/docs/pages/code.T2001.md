# T2001 rows-do-not-fit

A table change that the rows which are there do not fit. It names how many rows, and the switch to the new version does not happen.

## Details

A change that is checked against the rows is applied only where every row fits: an optional column that becomes required, a new `unique` rule, a narrower limit, a removed `choice` value, a type that the values must convert to, and a retired link that is revived as a required one while a row it named is gone. Any other change of type, and a change of the `size` of a vector, is never applied by itself. A `vector` column whose model changed while rows hold a vector is refused with this code too, unless the column says what becomes of them.

In an app that keeps a data file for each tenant, the rows of each file are counted by themselves, and the message names the tenant whose file holds them. A file that cannot be brought up to the running shape of the tables fails with this code too.

A table that gains or loses `tenant`, or whose tenants are of another table, is found with this code as well: its rows live in another file from now on, and no table change moves a row by itself. The finding names the table and counts no rows.

## The fix

Change the rows so that they fit. Where they cannot: add a new column, fill it with a change, then remove the old one. For a vector column whose model changed, state `old: 'drop'` to empty it, or `old: 'keep'` where both models make the same vectors. For a table that gains or loses `tenant`, take the version with `--move`, which moves the rows: `tent publish --move`, or `tent start --move`. For a table whose tenants are of another table than before, take two versions so: one in which it states no `tenant`, which brings its rows into the shared file, then one in which the other table keeps it apart.

## See also

`option.table.removed`, `option.vector.old`, `code.T2002`
