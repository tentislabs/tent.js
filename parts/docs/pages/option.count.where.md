# `where` of `count`

In the `from` of a column that the engine keeps, the filter that a linked row fits to be counted in the count.

## Value

A filter as a record, as `{ status: 'open' }`. Left out, every linked row is counted.

## Example

```ts
openOrders: number({ from: count({ of: orders, by: 'customer', where: { status: 'open' } }) })
```

## See also

`word.count`, `topic.types`
