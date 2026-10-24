# `by` of `sum`

In the `from` of a column that the engine keeps, the link column of the counted rows that points at the row that keeps the sum.

## Value

The name of a `link` column of the table of `of`. It is required.

## Example

```ts
spent: number({ from: sum({ of: orders, by: 'customer', column: 'total' }) })
```

## See also

`word.sum`, `topic.types`
