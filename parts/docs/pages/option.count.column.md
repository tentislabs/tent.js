# `column` of `count`

A column of the counted rows, which a kept `count` takes and does not read: it counts the linked rows themselves, where `sum`, `min` and `max` read a column.

## Value

A text, which a kept count leaves unread. A count is written without it.

## Example

```ts
openOrders: number({ from: count({ of: orders, by: 'customer', column: 'total' }) })
```

## See also

`word.count`, `option.sum.column`, `topic.types`
