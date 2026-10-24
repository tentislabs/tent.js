# T2006 search-not-text

A table names a column in `search` that is no text. The text search of a table covers its own text columns.

## Details

A `choice`, a number, a date and a list are no text, and neither is a `vector` column, which is searched with `near`. Both forms of `search` are held to it: the list of columns, and `{ columns, by }`.

## The fix

Name text columns in `search`. Where the words of another column must be found, keep them in a text column beside it, which a change writes or a `from` works out.

## See also

`option.table.search`, `word.text`, `code.T2010`
