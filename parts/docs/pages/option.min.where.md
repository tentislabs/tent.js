# `where` of `min`

In the `from` of a column that the engine keeps, the filter that a linked row fits to be counted in the least.

## Value

A filter as a record, as `{ status: 'open' }`. Left out, every linked row is counted.

## Example

```ts
first: date({ from: min({ of: orders, by: 'customer', where: { status: 'open' }, column: 'placedAt' }) })
```

## See also

`word.min`, `topic.types`
