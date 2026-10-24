# `by` of `max`

In the `from` of a column that the engine keeps, the link column of the counted rows that points at the row that keeps the most.

## Value

The name of a `link` column of the table of `of`. It is required.

## Example

```ts
last: date({ from: max({ of: orders, by: 'customer', column: 'placedAt' }) })
```

## See also

`word.max`, `topic.types`
