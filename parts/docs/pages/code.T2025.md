# T2025 count-across-files

A kept `count`, `sum`, `min` or `max` counts the rows of a table that lie in another data file than the row that holds it.

## Details

The engine moves a kept number inside the very write that adds, changes or removes a counted row, so the number is never late. One write is one data file (`option.table.tenant`): a number on a row of the shared file cannot move in the write of a tenant's file, and one in the file of a tenant cannot follow the rows of the shared file or of another tenant. The check reports such a column at its table.

## The fix

Keep the number on a table that lies in the same file as the rows it counts, as a tenant table whose tenants are of the same table; or work it out in a query, which counts across files.

## See also

`word.count`, `option.table.tenant`
