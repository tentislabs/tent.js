# T2014 tenant-rule-open

A note. The `read` rule of a table that keeps a data file for each tenant does not name its `tenant` column.

## Details

A table that states `tenant` keeps the rows of each tenant in a file of their own, and a caller says with `of(tenant)` whose file a plan reads. The file alone holds nobody back: the `read` rule does. Where the rule never names the `tenant` column, whoever passes the rest of it reads the rows of every tenant, by naming one after another.

The check notes it for a rule such as `'signedIn'`, a role, `'owner'`, and a `where` whose filter names other columns alone. It is no note where the filter names the column, and where it reads a tenant table whose tenants are of the same table, as a rule of order lines that reads their orders: that plan is read in the file the rule is applied in. A rule that is code was not read, and is not noted.

It is a note, and the app runs: a table that every signed-in person may read in every tenant is sometimes what is meant.

## The fix

Hold the rule to the tenants of the caller: `where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } })`.

## See also

`option.table.tenant`, `code.T2013`, `code.T2109`
