# T3002 anyone-on-write

Bare `'anyone'` stands on a write: on `add`, `change` or `remove` of a table, on a change, or on an action. Whoever reaches the app may then write, and nothing says why.

## Details

Bare `'anyone'` is taken on the `read` of a table with no personal column and on a query that reads none. Everywhere else the reason is written down.

## The fix

Write the reason: `anyone('the contact form is public')`. Or let fewer callers in: `'signedIn'`, `role('staff')`.

## See also

`word.anyone`, `option.table.access`, `option.change.access`, `code.T3003`
