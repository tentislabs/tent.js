# `column` of `sum`

In the `from` of a column that the engine keeps, the column of the counted rows whose sum is kept.

## Value

The name of a `number` column of the table of `of`. It is required.

## Example

```ts
spent: number({ from: sum({ of: orders, by: 'customer', column: 'total' }) })
```

## Errors

`code.T1014`: no `column` is named, or the column that keeps the number is of another kind.

## See also

`word.sum`, `topic.types`
