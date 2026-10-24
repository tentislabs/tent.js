# T2013 tenant-misused

A table that keeps a data file for each tenant is used in a way that does not keep to one file.

## Details

When the project is described it is found for a chain or a write on a table that states `tenant` which does not begin with `of(tenant)`: a plan of `rows`, a write of `set`, a plan inside a filter or a rule, the starter data, and a chain of a body. One place is free of it: a plan inside the rule of a tenant table whose tenants are of the same table, which is read in the file the rule is applied in. It is also found for `of` on a table that is no tenant table, since no other table has it.

The check finds the other cases. A `tenant` that names no column, a column that is no link, a link that may hold nothing, a link to a tenant table itself, and a `tenant` column that does not state `onRemove: 'remove'`: the rows of a tenant go with their tenant. A link into a tenant's file from a table of the shared file, and a link between tenant tables whose tenants are of two different tables: the column alone would not say which file its row stands in. A link from a tenant's file into the shared file that states neither `onRemove: 'remove'` nor `'clear'`: the files may be closed when the row is removed, so nothing can be refused then. A sort or a group through such a link. And a change written with `set` whose writes go to two files, by the value that each `of` holds, or to a tenant's file and the shared file.

## The fix

Begin every chain and every write of such a table with `of`, which says whose file it is for: `orders.of(input('team')).where({ status: 'open' })`. Name the tenant by a required link to a table of the shared file, with `onRemove: 'remove'`. Where two files must name each other, hold the tenant and the id as two columns. Sort by a copy of the value that the row itself keeps. Write two files in two changes, which an action or a flow calls one after the other.

## See also

`option.table.tenant`, `word.table`, `code.T2014`, `code.T2109`
