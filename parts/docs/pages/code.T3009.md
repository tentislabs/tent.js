# T3009 system-skips-owner

A function that callers other than the system may call - its own rule is `'signedIn'`, `anyone` or a role - states `system` and changes a row named by its input, of a table whose rules would not let that caller change it, and holds the caller against no row before the write. So every such caller can write the rows of everybody.

## Details

The writes that pass no rule of their table are those of `set` in a function that states `system`, and those through `db.system`. A write through `db` is held to the rule of the table, and is not reported. The rule of the table may be `'owner'`, a `where`, or none at all for that write. An add names no row: it is reported where the rule of the table for `add` is `'owner'`.

A function counts as holding the caller against the row where the code of its `run` reads the `owner` column of a row or names it as a key of a filter of `where`; reads through `db`, whose rules hand the caller their own rows alone; or reads the id of the caller, as a filter, a call that asks for the caller's place, or a test does. A value that it writes is no check, and neither is a `set`, which holds nothing against the caller. A check that is only the caller's role holds no row. A function open to a role that changes the rows of a table whose rule is `'owner'` is not reported: that is what `system` lets the staff do on purpose. Full access that is reached through another name, as `const all = db.system`, is full access still. Whether the check is the right one is the builder's to see.

## The fix

Remove `system`, and the rule of the table holds. Or keep it and add a check that the caller may change the row: read it through `db`, or read it and `fail` where it is not the caller's. Or let only some callers in: `access: role('staff')`.

## See also

`option.change.system`, `option.table.owner`, `option.table.access`, `code.T3004`
