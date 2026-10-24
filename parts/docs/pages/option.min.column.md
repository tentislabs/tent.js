# `column` of `min`

In the `from` of a column that the engine keeps, the column of the counted rows whose least is kept.

## Value

The name of a column of the table of `of`, of the kind of the column that keeps it, as a `date` for a `date`. It is required.

## Example

```ts
first: date({ from: min({ of: orders, by: 'customer', column: 'placedAt' }) })
```

## Errors

`code.T1014`: no `column` is named, or the column that keeps the number is of another kind.

## See also

`word.min`, `topic.types`
