# T2109 not-one-file

Code read or wrote a table that keeps a data file for each tenant in a way that does not keep to the file of one tenant.

## Details

A table that states `tenant` keeps the rows of each tenant in a data file of their own. One plan reads one file, and one change writes one file: the shared file, or the file of one tenant. The code is raised while running, in four cases.

A chain of `db` on such a table that names no tenant: `db.orders.where(...)` in place of `db.orders.of(team).where(...)`. A plan inside a filter counts too.

A change that writes a second file. Its first write names its file. A write to the file of another tenant, or to the shared file after a tenant's file, undoes the whole change, whatever the code does with the error. A change may read any file.

A write that gives the tenant column of a row another tenant than `of` names. `add` writes the tenant into that column itself, and no change moves a row to another tenant.

A handle that writes a shared table of the engine inside a change of a tenant's file, as `sessions.start` does.

## The fix

Begin every chain on the table with `of(tenant)`. Write two files in two changes, which an action or a flow calls one after the other. Move a row to another tenant by removing it there and adding it here.

## See also

`option.table.tenant`, `code.T2013`, `code.T2104`
