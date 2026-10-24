# `by` of `count`

In the `from` of a column that the engine keeps, the link column of the counted rows that points at the row that keeps the count.

## Value

The name of a `link` column of the table of `of`. It is required.

## Example

```ts
openOrders: number({ from: count({ of: orders, by: 'customer', where: { status: 'open' } }) })
```

## See also

`word.count`, `topic.types`
