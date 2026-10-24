# `indexes` of `table`

Indexes over several columns.

## Value

A list of column lists, as `[['status', 'placedAt']]`. Left out, only the indexes that are made by themselves exist.

## Example

```ts
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), note: text({ optional: true }), total: number() },
  indexes: [['total', 'note']],
})
```

## See also

`word.table`
