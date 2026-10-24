# T3101 access-denied

A rule does not let this caller do it. A caller gets it with the status 403.

## Details

The message names the table, what was tried and the rule: `customers.change needs role 'staff'; the caller is signed in and has no such role`. It is raised for an `add` whose new row the `add` rule does not let in, and for a `change` and a `remove` of a row that the caller may read and may not touch. A row that the caller may not even read is not found for them (`code.T2103`). A read that a rule does not let through is no error: it answers no rows.

It is also raised for a write that names a column which only code with full access may write, as `roles` of `users`.

## The fix

Give the caller the role the rule names, or call a function that states `system` and holds the caller to a rule of its own.

## See also

`code.T2103`, `word.table`
