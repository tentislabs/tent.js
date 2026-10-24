# T2105 vector-not-valid

A vector that a change writes, or that a `near` is given in code, is no vector of its column.

## Details

A vector is a list of finite numbers, as many as the `size` of the column. A list of another length, a number that is not finite, and a number that 32 bits cannot hold are refused. A vector of zeros is kept like any other, but it has no direction: given to a `near` with `'cosine'` as the value, it is refused with this code.

## The fix

Write a list of exactly `size` finite numbers. Clear a vector column with `null`. To search around a vector of zeros, state `measure: 'straight'`.

## See also

`word.vector`, `option.vector.size`, `code.T2106`
