# T3006 private-in-output

A query written with `rows` names a `private` column in `pick`, in a `group`, or in its `output`. A private column never leaves the server in a row, so that field is not in what the query answers.

## Details

The cases: the column in `pick`, also through a link; the column as what a `group` groups by; the column inside a value that a group works out, as `sum`; and a field of the `output` of the query that is a private column of its table.

## The fix

Take the column out of the plan. Where a caller must be shown a value that is worked out from it, a query in code that states `system` and an `output` answers that value, as the word of the builder.

## See also

`option.query.rows`, `option.query.output`, `option.table.columns`
