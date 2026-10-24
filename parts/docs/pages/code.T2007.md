# T2007 owner-not-users

The `owner` of a table names a column that is no `link('users')`, or the rule `'owner'` stands on a table that states no `owner`.

## Details

The owner of a row is a user: the rule `'owner'` holds the column that `owner` names against the caller. Two tables need no `owner` for the rule: `users`, where it means the caller's own row, and a table that states `shows`, where it means the rows of the caller's own use.

## The fix

State `owner: 'placedBy'`, where `placedBy` is a `link('users')`. Where rows belong to something else than a user, as a team, write the rule with `where(...)`.

## See also

`option.table.owner`, `option.table.access`, `word.where`
