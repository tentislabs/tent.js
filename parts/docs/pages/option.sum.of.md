# `of` of `sum`

In the `from` of a column that the engine keeps, the table whose rows the sum is worked out of.

## Value

The table, as its definition or as its name. It is required. Its rows lie in the same data file as the row that keeps the number.

## Example

```ts
spent: number({ from: sum({ of: orders, by: 'customer', column: 'total' }) })
```

## Errors

`code.T2025`: the counted rows lie in another data file than the row that holds the number.

## See also

`word.sum`, `topic.types`
