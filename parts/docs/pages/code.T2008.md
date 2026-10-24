# T2008 vector-size

A `near` is handed a value whose size is not the size of the column: an input that is declared as a `vector` of another size, or a list that is written with another number of entries.

## Details

The check reads a plan written with `rows` and a chain in a `run` that was read. A vector of the wrong length that code hands to `near` while the app runs is `code.T2105`.

## The fix

Declare the input with the size of the column: `vector({ size: 1536 })`. Both sides of a search are made by one model, which gives one size.

## See also

`word.vector`, `option.vector.size`, `code.T2105`, `code.T2012`
