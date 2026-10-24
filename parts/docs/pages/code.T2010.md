# T2010 vector-misused

A vector column is used as an ordinary column, or `near` stands where it does not belong.

## Details

The cases: a vector column in a filter other than `{ empty: true }`, in a sort, in an index, in `unique` or in a group; `near` on a column that is no vector; `near` joined with `sort`, `newest`, `oldest`, `group`, `count`, `skip`, `after` or `get`; and a `near` plan inside `in`, or in the filter of a `where` rule. `near` joins with `where`, `search`, `with`, `pick`, `limit` and `first()`. A vector column in `search` is `code.T2006`, and one named as `owner` is `code.T2007`.

## The fix

Search a vector column with `near`, and read it with `pick`. A search by words and by meaning together is one plan that holds both `search` and `near`: the two lists are joined by their ranks.

## See also

`word.vector`, `option.table.indexes`, `option.table.unique`, `code.T2106`
