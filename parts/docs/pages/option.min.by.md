# `by` of `min`

In the `from` of a column that the engine keeps, the link column of the counted rows that points at the row that keeps the least.

## Value

The name of a `link` column of the table of `of`. It is required.

## Example

```ts
first: date({ from: min({ of: orders, by: 'customer', column: 'placedAt' }) })
```

## See also

`word.min`, `topic.types`
