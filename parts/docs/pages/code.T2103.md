# T2103 row-not-found

A `change` or a `remove` names a row that does not exist, or that this caller may not read. A caller gets it with the status 404.

## Details

A row that the caller may not read is not found for them: the answer does not say whether it is there.

## The fix

Hold the id against the rows the caller can read before the write, or catch the error where a missing row is expected.

## See also

`word.table`, `topic.errors`
