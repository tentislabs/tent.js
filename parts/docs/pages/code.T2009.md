# T2009 near-without-limit

A plan with `near` states neither `limit` nor `first()`. A search by meaning answers the nearest rows, and the plan says how many.

## Details

There is no largest value: a further page is a larger `limit`. A plan that code makes with `near` and no `limit` is `code.T2106` while the app runs.

## The fix

State a `limit`: `articles.near('meaning', input('to')).limit(10)`. Or end the plan with `first()` for the one nearest row.

## See also

`word.vector`, `option.query.rows`, `code.T2106`
