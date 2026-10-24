# `where` of `sum`

In the `from` of a column that the engine keeps, the filter that a linked row fits to be counted in the sum.

## Value

A filter as a record, as `{ status: 'open' }`. Left out, every linked row is counted.

## Example

```ts
spent: number({ from: sum({ of: orders, by: 'customer', where: { status: 'open' }, column: 'total' }) })
```

## See also

`word.sum`, `topic.types`
