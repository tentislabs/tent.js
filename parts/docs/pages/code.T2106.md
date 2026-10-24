# T2106 near-not-valid

A plan that code made with `near` is none that can be answered.

## Details

A plan with `near` names a `vector` column of its own table, states a `limit` or ends with `first()`, and joins with `where`, `search`, `with` and `pick` alone. It does not join with `sort`, `newest`, `oldest`, `group`, `count`, `skip`, `after` or `get`, and it may not stand inside `in`.

## The fix

State a `limit`. A further page is a larger `limit`. To search by words and by meaning together, write `search` and `near` in one plan.

## See also

`word.vector`, `code.T2105`
