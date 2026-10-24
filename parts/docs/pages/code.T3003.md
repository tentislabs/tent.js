# T3003 anyone-on-personal

Bare `'anyone'` stands on a read of personal data: on `read` of a table that has a column marked `personal`, or on a query that reads such a column.

## Details

What a query reads is taken from its plan: a plan that states `pick` reads the columns it picks, and any other plan every column of the tables it reads. For a `run` that was read, it is the tables that the body reads. A query in code that states no `reads` is not held to this.

## The fix

Write the reason: `anyone('the speakers of the conference are public')`. Or let fewer callers in, or `pick` the columns that are not personal.

## See also

`word.anyone`, `option.table.access`, `option.query.access`, `code.T3002`
