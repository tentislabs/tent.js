# `copy` of `vector`

How the copy of a vector column that the store keeps in memory holds its numbers.

## Value

`'small'`. Left out, the copy keeps every number as it is stored, four bytes each, and a search is exact.

With `'small'` the copy keeps one byte a number: about a quarter of the memory, 74 MB in place of 294 MB for 50,000 vectors of 1,536 numbers. A search then finds the best `limit` times four rows by the small copy, reads their full vectors from the table, and answers the nearest `limit` of those by the full vectors. That is not exact: on 50,000 vectors of 1,536 numbers the best ten agree with an exact search in nine of ten or more. Each row that such a `near` answers says so with `exact: false` beside its `distance`. It is for a column whose copy would not fit in memory otherwise; it is read when the store builds its copy, so a change of it holds from the next opening of the app.

## Example

```ts
meaning: vector({ size: 1536, model: embedder, copy: 'small' })
```

## See also

`word.vector`, `topic.plans`
