# `where` of `max`

In the `from` of a column that the engine keeps, the filter that a linked row fits to be counted in the most.

## Value

A filter as a record, as `{ status: 'open' }`. Left out, every linked row is counted.

## Example

```ts
last: date({ from: max({ of: orders, by: 'customer', where: { status: 'open' }, column: 'placedAt' }) })
```

## See also

`word.max`, `topic.types`
